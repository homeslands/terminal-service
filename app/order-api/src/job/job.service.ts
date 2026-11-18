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
import {
  PointTransactionObjectTypeEnum,
  PointTransactionTypeEnum,
} from 'src/gift-card-modules/point-transaction/entities/point-transaction.enum';
import { CurrencyUtil } from 'src/shared/utils/currency.util';
import { SharedBalanceService } from 'src/shared/services/shared-balance.service';
import { SharedPointTransactionService } from 'src/shared/services/shared-point-transaction.service';
import { CreatePointTransactionPayload } from 'src/shared/interfaces/commons/shared-point-transaction.interface';
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
    private readonly sharedBalanceService: SharedBalanceService,
    private readonly sharedPointTransactionService: SharedPointTransactionService,
    private readonly eventEmitter: EventEmitter2,
    private readonly accumulatedPointService: AccumulatedPointService,
  ) {}

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
        // Handle calc balance when use point payment method
        if (order.payment?.paymentMethod === PaymentMethod.POINT) {
          // MOT nguon khoa cho ca ba lenh duoi (buoc 2.12/2.13 — 2C). Doc
          // `sharedUserId`, KHONG phai `slug`: doi ten khoa ma giu nguyen gia
          // tri la "SOT 1" cua dot ra 12/09/2026, TypeScript khong bat duoc.
          const sharedUserId = order.owner?.sharedUserId;

          // Calc balance
          // Buoc 5.5: doi dich o 7.7 ⇒ gui kem orderOpIdempotencyKey(<slug don>, 'debit') (`shared/constants/service-ref.constant.ts`).
          await this.sharedBalanceService.calcBalance({
            sharedUserId,
            points: order.payment.amount,
            type: 'out',
          });

          const currentBalance = await this.sharedBalanceService.findOneByField(
            { sharedUserId, slug: null },
          );

          // Create point transaction
          await this.sharedPointTransactionService.create({
            type: PointTransactionTypeEnum.OUT,
            desc: `Sử dụng ${CurrencyUtil.formatCurrency(order.subtotal)} xu thanh toán đơn hàng`,
            objectType: PointTransactionObjectTypeEnum.ORDER,
            objectSlug: order.slug,
            points: order.payment?.amount,
            sharedUserId,
            balance: currentBalance.points,
          } satisfies CreatePointTransactionPayload);
        }

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
