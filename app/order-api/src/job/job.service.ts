import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ChefOrderUtils } from 'src/chef-order/chef-order.utils';
// import { ExportInvoiceDto } from 'src/invoice/invoice.dto';
import { InvoiceService } from 'src/invoice/invoice.service';
import { MailService } from 'src/mail/mail.service';
import { NotificationUtils } from 'src/notification/notification.utils';
import { OrderStatus, OrderType } from 'src/order/order.constants';
import { TableStatus } from 'src/table/table.constant';
import { Order } from 'src/order/order.entity';
import { OrderUtils } from 'src/order/order.utils';
import { PaymentMethod, PaymentStatus } from 'src/payment/payment.constants';
import { IsNull, Repository } from 'typeorm';
import _ from 'lodash';
import { Job } from './job.entity';
import { JobStatus } from './job.constants';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { PointTransactionObjectTypeEnum } from 'src/gift-card-modules/point-transaction/entities/point-transaction.enum';
import { CurrencyUtil } from 'src/shared/utils/currency.util';
import { SharedUserServiceClient } from 'src/external-services/shared-user-service/shared-user-service.client';
import { assertUserKeyLoaded } from 'src/user/user.constant';
import { InvoiceAction } from 'src/invoice/invoice.constants';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccumulatedPointService } from 'src/accumulated-point/accumulated-point.service';
import {
  orderOpIdempotencyKey,
  orderRef,
} from 'src/shared/constants/service-ref.constant';

@Injectable()
export class JobService {
  constructor(
    private readonly orderUtils: OrderUtils,
    private readonly mailService: MailService,
    private readonly invoiceService: InvoiceService,
    private readonly chefOrderUtils: ChefOrderUtils,
    private readonly notificationUtils: NotificationUtils,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly transactionManagerService: TransactionManagerService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    // Buoc 7.7c: tru / hoan xu qua vi shared-user (bo SharedBalanceService +
    // SharedPointTransactionService - dong so cai di cung lenh `debit`).
    private readonly sharedUserServiceClient: SharedUserServiceClient,
    private readonly eventEmitter: EventEmitter2,
    private readonly accumulatedPointService: AccumulatedPointService,
  ) {}

  // Buoc 7.7c - tru xu cua don qua vi shared-user. Tra khoa da tru (de Z-7
  // hoan neu don khong chot duoc), hoac `null` khi khong co gi de tru.
  private async debitXuForOrder(
    order: Order,
    sharedUserId: string,
    context: string,
  ): Promise<string | null> {
    const points = Number(order.payment.amount);
    if (!(points > 0)) {
      // shared-user chi nhan so nguyen >= 1; don 0 xu khong co gi de tru.
      this.logger.warn(
        `Order ${order.slug}: xu payment amount ${order.payment.amount}, nothing to debit`,
        context,
      );
      return null;
    }
    const transactionId = orderOpIdempotencyKey(order.slug, 'debit');
    const debit = await this.sharedUserServiceClient.debitBalance({
      userId: sharedUserId,
      points,
      transactionId,
      objectType: PointTransactionObjectTypeEnum.ORDER,
      objectId: order.id,
      objectSlug: order.slug,
      desc: `Sử dụng ${CurrencyUtil.formatCurrency(order.subtotal)} xu thanh toán đơn hàng`,
    });
    // Lan chay lai (`replayed`) sau mot lan Z-7 da hoan: khoa nay "da chay" -
    // `debit` cung khoa khong tru them, chot don luc nay la don MIEN PHI. Chan
    // lai, de don PENDING; thu ngan thu bang cach khac.
    if (
      debit.replayed &&
      (await this.sharedUserServiceClient.isDebitReleased(transactionId))
    ) {
      this.logger.error(
        `Order ${order.slug}: the xu debit ${transactionId} was already released (Z-7) - the order cannot be paid with xu under this key any more; collect the payment another way`,
        undefined,
        context,
      );
      throw new Error(
        `xu debit ${transactionId} of order ${order.slug} was already released`,
      );
    }
    this.logger.log(
      `Order ${order.slug}: debited ${debit.points} xu from ${sharedUserId} (key ${transactionId}, balance ${debit.balance}${debit.replayed ? ', replayed' : ''})`,
      context,
    );
    return transactionId;
  }

  // Buoc 7.7c (Z-7) - hoan lan tru xu khi don khong chot duoc. KHONG nem:
  // ben goi dang nem loi goc. Hong => CRITICAL (khuon `rollbackSharedUserCreate`).
  private async releaseXuDebit(
    transactionId: string,
    orderSlug: string,
    sharedUserId: string,
    points: number,
    context: string,
  ): Promise<void> {
    try {
      const released =
        await this.sharedUserServiceClient.releaseBalance(transactionId);
      this.logger.warn(
        `Order ${orderSlug}: not finalized after its xu debit - released ${released.points} xu back to ${sharedUserId} (key ${released.transactionId}, balance ${released.balance}${released.replayed ? ', replayed' : ''})`,
        context,
      );
    } catch (releaseError) {
      this.logger.error(
        `CRITICAL: order ${orderSlug} was not finalized after its xu debit and the release failed too - customer ${sharedUserId} is charged ${points} xu for an unpaid order. Release by hand with key ${transactionId} (POST /internal/balance/release) or let reconciliation Z-8 pick it up. Release error: ${releaseError?.message}`,
        releaseError?.stack,
        context,
      );
    }
  }

  async updateOrderStatusAfterPaymentPaid(job: Job) {
    const context = `${JobService.name}.${this.updateOrderStatusAfterPaymentPaid.name}`;
    this.logger.log(
      `Update order status after payment process in job`,
      context,
    );
    let orderSlug = null;
    try {
      this.logger.log(`Request data: ${JSON.stringify(job)}`, context);
      const order = await this.orderUtils.getOrder({
        where: {
          id: job.data ?? IsNull(),
        },
      });
      orderSlug = order.slug;

      this.logger.log(`Current order: ${JSON.stringify(order)}`, context);

      if (
        order.payment?.statusCode === PaymentStatus.COMPLETED &&
        order.status === OrderStatus.PENDING &&
        order.referenceNumber === null
      ) {
        // Buoc 7.5 (QD6, QD7): TRU XU + XAC NHAN DIEM TRUOC, CHOT DON + TRA BAN
        // SAU. Hai lenh duoi hong => nem ra `catch` ngoai cung => don con
        // PENDING, `referenceNumber` con null, BAN CHUA DUOC TRA, job con
        // PENDING => `job.recovery` chay lai ca ham o lan khoi dong sau (guard
        // tren van dung). Truoc 7.5 don da chot + tra ban + commit roi moi tru:
        // chet giua chung la guard sai => xu KHONG BAO GIO bi tru (loi co tu
        // mono). Con ho: tru xong ma lenh chot hong (BE-22) thi lan chay lai tru
        // lan hai - 7.7 dong lai bang khoa idempotent `terminal:<orderSlug>:debit`.
        // Buoc 7.7c (trend-api.md 7.4(c), QD9): tru xu MOT nhip o vi
        // shared-user - dong so cai di CUNG lenh, so du lay tu cau tra loi (bo
        // luot doc-sau-tru). Khoa `terminal:<orderSlug>:debit`: job.recovery chay
        // lai sau khi da tru => `replayed`, khong tru lan hai (dong lo BE-22 /
        // chet giua chung cua 7.5). Hong => nem => don PENDING (QD6).
        let debitKey: string | null = null;
        if (order.payment?.paymentMethod === PaymentMethod.POINT) {
          // `sharedUserId`, KHONG phai `slug` ("SOT 1" cua dot ra 12/09/2026).
          debitKey = await this.debitXuForOrder(
            order,
            assertUserKeyLoaded(order.owner?.sharedUserId, context),
            context,
          );
        }

        // Buoc 7.7c (Z-7, trend-api.md 7.4): tu day toi het lenh chot, moi loi
        // lam don KHONG chot duoc sau khi da tru xu => `release` cung khoa roi
        // nem tiep (don + job con PENDING nhu 7.5). `release` hong => log
        // CRITICAL de doi soat Z-8 / xu tay.
        try {
          // confirm use accumulated points - QD7: KHONG bat loi. Hong ma van chot
          // thi khach da duoc giam bang diem, diem chua bi tru, va dong giu cho
          // nam lai chan lan dat don sau cua chinh khach do.
          // Buoc 2.15 — 2C: tham chieu `terminal:<orderSlug>`, khong phai id cuc bo.
          await this.accumulatedPointService.confirmPointsUsage(
            orderRef(order.slug),
          );
          this.logger.log(
            `Confirmed points usage for order ${order.slug}`,
            context,
          );

          const lastOrderWithNumber = await this.orderRepository.findOne({
            where: {
              branch: { id: order.branch.id },
              payment: { statusCode: PaymentStatus.COMPLETED },
            },
            order: {
              referenceNumber: 'DESC',
            },
          });

          const nextReferenceNumber =
            (lastOrderWithNumber?.referenceNumber ?? 0) + 1;

          // Update order status to PAID
          let finalized = false;
          await this.transactionManagerService.execute(
            async (manager) => {
              Object.assign(order, {
                status: OrderStatus.PAID,
                referenceNumber: nextReferenceNumber,
              });
              await manager.save(order);

              if (order.type === OrderType.AT_TABLE && order.table) {
                Object.assign(order.table, { status: TableStatus.AVAILABLE });
                await manager.save(order.table);
              }

              Object.assign(job, { status: JobStatus.COMPLETED });
              await manager.save(job);
            },
            async () => {
              finalized = true;
              this.logger.log(
                `Update order ${order.slug} status to PAID successfully`,
                context,
              );
            },
            (error) => {
              this.logger.error(
                `Error updating order ${order.slug} status: ${error.message}`,
                error.stack,
                context,
              );
              return;
            },
          );

          // Lenh chot hong bi `execute` nuot (BE-22 - co tu truoc, chua sua cho
          // duong khac). Rieng duong xu: don chua chot ma xu da tru => bao loi
          // de nhanh `catch` duoi hoan xu, khong chay tiep hoa don / bep.
          if (debitKey && !finalized) {
            throw new Error(
              `order ${order.slug} was not finalized after its xu debit`,
            );
          }
        } catch (error) {
          if (debitKey) {
            await this.releaseXuDebit(
              debitKey,
              order.slug,
              order.owner?.sharedUserId,
              Number(order.payment?.amount),
              context,
            );
          }
          throw error;
        }
        // add accumulated points
        try {
          // Buoc 2.14 — 2C: khoa la `sharedUserId`, KHONG phai id cuc bo.
          // `getOrder` nap quan he `owner.role` khong hep `select:` nen cot
          // guong co mat; ben nhan (`addPointsForOrder`) tu goi
          // `assertUserKeyLoaded` truoc khi dua vao `where`.
          //
          // ⚠ Chuoi `try/catch` nay **nuot loi** (chi `logger.error`), nen doi
          // sai khoa o day thi job van COMPLETED, don van PAID, chi la khong
          // ai duoc cong diem - **khong co mau do nao**. Kiem bang cach doc
          // `accumulated_point_tbl` cua dung nguoi do, dung doc ma thoat.
          await this.accumulatedPointService.addPointsForOrder({
            sharedUserId: order.owner?.sharedUserId,
            orderId: order.id,
            points: order.payment?.amount,
            orderTotal: order.subtotal - order.deliveryFee,
          });
          this.logger.log(
            `Added accumulated points for order ${order.slug}`,
            context,
          );
        } catch (error) {
          // QD8: cong diem hong VAN cho chot don (don da PAID o tren), chi log.
          // Log phai tra duoc de doi soat Z-8 goi lai: slug don + sharedUserId +
          // khoa idempotent cua lenh `add`.
          this.logger.error(
            `Error when adding accumulated points for order ${order.slug} (sharedUserId ${order.owner?.sharedUserId}, key ${orderOpIdempotencyKey(order.slug, 'add')}): ${error.message}`,
            error.stack,
            context,
          );
        }

        // create invoice
        try {
          await this.invoiceService.create(order.slug);
        } catch (error) {
          this.logger.error(
            `Error when create invoice for order ${order.slug}: ${error.message}`,
            error.stack,
            context,
          );
        }

        // call listener to print invoice
        this.eventEmitter.emit(InvoiceAction.INVOICE_CREATED, {
          orderId: order.id,
        });

        // Sperate order to chef orders
        if (_.isEmpty(order.chefOrders)) {
          await this.chefOrderUtils.createChefOrder(job.data, false);
        }

        // Send notification to all chef role users in the same branch
        await this.notificationUtils.sendNotificationAfterOrderIsPaid(order);

        // send invoice email
        // const invoice = await this.invoiceService.exportInvoice({
        //   order: order.slug,
        // } as ExportInvoiceDto);
        // this.mailService.sendInvoiceWhenOrderPaid(order.owner, invoice);

        this.logger.log(`Update order status from PENDING to PAID`, context);
      }
    } catch (error) {
      this.logger.error(
        `Order ${orderSlug}: payment-paid job stopped: ${error.message}. If the coin debit or the points confirmation failed, the order stays PENDING (not finalized, table not released) and the job stays PENDING - job.recovery retries it on the next start (QD6/QD7)`,
        error.stack,
        context,
      );
    }
  }

  // async updateCardOrderStatusAfterPaymentCompletion(payload: {
  //   orderSlug: string;
  // }) {
  //   const context = `${JobService.name}.${this.updateCardOrderStatusAfterPaymentCompletion.name}`;
  //   this.logger.log(
  //     `Update card order ${payload?.orderSlug} status after payment completion req: ${JSON.stringify(payload)}`,
  //     context,
  //   );

  //   const order = await this.cardOrderRepository.findOne({
  //     where: {
  //       slug: payload.orderSlug,
  //     },
  //     relations: ['payment'],
  //   });

  //   if (!order) {
  //     this.logger.log(`Card order ${payload.orderSlug} not found`, context);
  //   }

  //   if (order.status !== CardOrderStatus.PENDING) {
  //     this.logger.log(`Card order ${order.slug} is not pending`, context);
  //     return;
  //   }

  //   if (order.payment?.statusCode === PaymentStatus.PENDING) {
  //     this.logger.log(
  //       `Payment ${order?.payment?.slug} status is pending`,
  //       context,
  //     );
  //     return;
  //   }

  //   Object.assign(order, {
  //     status:
  //       order.payment?.statusCode === PaymentStatus.COMPLETED
  //         ? CardOrderStatus.COMPLETED
  //         : CardOrderStatus.FAIL,
  //     paymentStatus: order.payment?.statusCode,
  //   } as Partial<CardOrder>);

  //   await this.transactionManagerService.execute<CardOrder>(
  //     async (manager) => {
  //       return await manager.save(order);
  //     },
  //     (result) => {
  //       this.logger.log(
  //         `Card order ${result.slug} status ${result.status}`,
  //         context,
  //       );
  //     },
  //     (err) => {
  //       this.logger.error(
  //         `Error when updating card order status: ${err.message}`,
  //         err.stack,
  //         context,
  //       );
  //     },
  //   );
  // }
}
