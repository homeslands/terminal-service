import { Inject, Injectable, Logger } from '@nestjs/common';
import { IPaymentStrategy } from './payment.strategy';
import { Payment } from '../entity/payment.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { PaymentMethod, PaymentStatus } from '../payment.constants';
import { Order } from 'src/order/order.entity';
import { v4 as uuidv4 } from 'uuid';
import { SharedUserServiceClient } from 'src/external-services/shared-user-service/shared-user-service.client';
import { BalanceException } from 'src/gift-card-modules/balance/balance.exception';
import { BalanceValidation } from 'src/gift-card-modules/balance/balance.validation';
import { assertUserKeyLoaded } from 'src/user/user.constant';

@Injectable()
export class PointStrategy implements IPaymentStrategy {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly sharedUserServiceClient: SharedUserServiceClient,
  ) {}

  async process(order: Order): Promise<Payment> {
    const context = `${PointStrategy.name}.${this.process.name}`;
    this.logger.log(
      `Process point payment for order ${order.slug} req`,
      context,
    );

    // Buoc 7.7a (QD9, trend-api.md 7.4(a)): KIEM so du o vi shared-user bang
    // `lookup` - KHONG `reserve`. Lenh tru that (`debit` mot nhip, chan am o
    // tang DB) chay trong job sau khi tra (7.7c); day chi chan som de thu
    // ngan thay loi ngay. shared-user khong tra loi => 503/162001.
    // `sharedUserId`, KHONG phai `slug`: doi ten khoa ma giu nguyen gia tri
    // (`sharedUserId: order?.owner?.slug`) la "SOT 1" cua dot ra 12/09/2026 -
    // TypeScript khong bat duoc vi ca hai la `string`, va hau qua la moi luot
    // tra bang xu bao "het tien".
    const sharedUserId = assertUserKeyLoaded(
      order?.owner?.sharedUserId,
      context,
    );
    const points =
      await this.sharedUserServiceClient.lookupBalancePoints(sharedUserId);
    if (points === null) {
      this.logger.warn(
        `Order ${order.slug}: owner ${sharedUserId} not found at shared-user`,
        context,
      );
      throw new BalanceException(BalanceValidation.BALANCE_NOT_FOUND);
    }
    if (points < order.subtotal) {
      this.logger.warn(
        `Order ${order.slug}: balance ${points} < subtotal ${order.subtotal}`,
        context,
      );
      throw new BalanceException(BalanceValidation.INSUFFICIENT_BALANCE);
    }

    const payment = {
      paymentMethod: PaymentMethod.POINT,
      amount: order.subtotal,
      loss: order.loss,
      message: 'hoa don thanh toan',
      userId: order.owner.id,
      transactionId: uuidv4(),
      statusCode: PaymentStatus.COMPLETED,
      statusMessage: PaymentStatus.COMPLETED,
    } as Payment;

    this.paymentRepository.create(payment);
    const createdPayment = await this.paymentRepository.save(payment);
    this.logger.log(`Payment created: ${createdPayment.slug}`, context);

    return createdPayment;
  }
}
