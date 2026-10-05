import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  Repository,
  UpdateEvent,
} from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Inject, Logger } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { CardOrder } from './entities/card-order.entity';
import { CardOrderStatus } from './card-order.enum';
import { SchedulerRegistry } from '@nestjs/schedule';
import { createCancelCardOrderJobName } from './card-order.constants';
import { ConfigService } from '@nestjs/config';
import { GiftCardService } from '../gift-card/gift-card.service';
import { PointTransactionService } from '../point-transaction/point-transaction.service';
import { BalanceService } from '../balance/balance.service';
import { CardOrderService } from './card-order.service';
import { CardOrderException } from './card-order.exception';
import { CardOrderValidation } from './card-order.validation';
import { PaymentStatus } from 'src/payment/payment.constants';
import { PaymentUtils } from 'src/payment/payment.utils';

@EventSubscriber()
export class CardOrderSubscriber
  implements EntitySubscriberInterface<CardOrder> {
  private readonly CANCEL_CARD_ORDER_JOB_DELAY = 1000 * 60 * 15;

  constructor(
    dataSource: DataSource,
    @InjectRepository(CardOrder)
    private readonly cardOrderRepository: Repository<CardOrder>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly configService: ConfigService,
    private readonly gcService: GiftCardService,
    private readonly ptService: PointTransactionService,
    private readonly balanceService: BalanceService,
    private readonly cardOrderService: CardOrderService,
    private readonly paymentUtils: PaymentUtils
  ) {
    dataSource.subscribers.push(this);
  }

  listenTo() {
    return CardOrder;
  }

  async afterInsert(event: InsertEvent<CardOrder>): Promise<any> {
    const { entity } = event;
    await this.addCancelCardOrderJob(entity);
  }

  async afterUpdate(event: UpdateEvent<CardOrder>): Promise<any> {
    const { databaseEntity } = event;
    const updatedEntity = await event.manager.getRepository(CardOrder).findOne({
      where: {
        id: databaseEntity.id,
      },
      relations: ['receipients'],
    });

    if (!updatedEntity) return;

    // Delete job
    if (
      updatedEntity.status === CardOrderStatus.COMPLETED ||
      updatedEntity.status === CardOrderStatus.CANCELLED
    )
      await this.deleteCancelCardOrderJob(updatedEntity);
  }

  async addCancelCardOrderJob(entity: CardOrder) {
    const context = `${CardOrderSubscriber.name}.${this.addCancelCardOrderJob.name}`;
    this.logger.log(`Adding \`cancel card order\` job ${entity.slug}`, context);

    if (entity.status !== CardOrderStatus.PENDING) return;

    const JobName = createCancelCardOrderJobName(entity.slug);
    const delay =
      +this.configService.get('CARD_ORDER_PAYMENT_TIMEOUT') ||
      this.CANCEL_CARD_ORDER_JOB_DELAY;
    let job;

    try {
      job = this.schedulerRegistry.getTimeout(JobName);
    } catch (error) {
      this.logger.error(
        `Error when adding cancel card order job ${JobName}: ${error.message}`,
        error.stack,
        context,
      );
    }

    // ⛔ try/catch PHAI nam BEN TRONG callback, khong duoc dua vao try/catch
    // cua ham bao ngoai.
    //
    // Callback nay chay sau `delay` (mac dinh hang phut), khi ham bao ngoai da
    // tra ve tu lau - khong con try/catch nao con hieu luc. Mot `await` nem
    // loi o day la `unhandledRejection`, va Node **thoat ca tien trinh**. Da
    // xay ra THAT o `trend` (progress/trend-api.md, 04/09/2026).
    //
    // `handleCancel` nem `CardOrderException` trong nghiep vu binh thuong
    // (don khong con PENDING vi khach da tra tien xong) - tuc duong nay KHONG
    // phai hiem gap. Va tu giai doan 1, no con co the nem 503 vi
    // `assertActive` goi mang sang shared-user.
    const timeoutId = setTimeout(() => {
      this.handleCancel(entity.slug).catch((error) => {
        this.logger.error(
          `Error when cancelling card order ${entity.slug}: ${error?.message}`,
          error?.stack,
          context,
        );
      });
    }, delay);

    if (!job) {
      this.schedulerRegistry.addTimeout(JobName, timeoutId);
      this.logger.log(
        `Add cancel card order job ${JobName} successfully`,
        context,
      );
    }
  }

  async handleCancel(slug: string) {
    const context = `${CardOrderSubscriber.name}.${this.handleCancel.name}`;
    this.logger.log(`Cancelling card order: ${slug}`, context);

    const cardOrder = await this.cardOrderRepository.findOne({
      where: { slug },
      relations: ['payment'],
    });

    if (!cardOrder) {
      throw new CardOrderException(CardOrderValidation.CARD_ORDER_NOT_FOUND);
    }

    if (cardOrder.status !== CardOrderStatus.PENDING) {
      throw new CardOrderException(CardOrderValidation.CARD_ORDER_NOT_PENDING);
    }

    if (cardOrder.payment)
      await this.paymentUtils.cancelPayment(cardOrder.payment?.slug);

    Object.assign(cardOrder, {
      status: CardOrderStatus.CANCELLED,
      paymentStatus: PaymentStatus.CANCELLED,
      cancelByName: `system`,
      cancelAt: new Date()
    } as CardOrder);

    await this.cardOrderRepository.save(cardOrder);
  }

  async deleteCancelCardOrderJob(entity: CardOrder) {
    const context = `${CardOrderSubscriber.name}.${this.deleteCancelCardOrderJob.name}`;
    this.logger.log(
      `Deleting \`cancel card order job\` ${entity.slug}`,
      context,
    );

    const JobName = createCancelCardOrderJobName(entity.slug);

    let job: any;
    try {
      job = this.schedulerRegistry.getTimeout(JobName);
    } catch (error) {
      this.logger.error(
        `Error when deleting cancel card order job ${JobName}: ${error.message}`,
        error.stack,
        context,
      );
    }

    if (job) this.schedulerRegistry.deleteTimeout(JobName);
  }
}
