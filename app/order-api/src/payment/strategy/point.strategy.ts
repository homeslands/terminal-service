import { Inject, Injectable, Logger } from '@nestjs/common';
import { IPaymentStrategy } from './payment.strategy';
import { Payment } from '../entity/payment.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { PaymentMethod, PaymentStatus } from '../payment.constants';
import { Order } from 'src/order/order.entity';
import { v4 as uuidv4 } from 'uuid';
import { SharedBalanceService } from 'src/shared/services/shared-balance.service';

@Injectable()
export class PointStrategy implements IPaymentStrategy {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly sharedBalanceService: SharedBalanceService,
  ) {}

  async process(order: Order): Promise<Payment> {
    const context = `${PointStrategy.name}.${this.process.name}`;
    this.logger.log(
      `Process point payment for order ${order.slug} req`,
      context,
    );

    // Validate balance points
    if (
      // `sharedUserId`, KHONG phai `slug`: doi ten khoa ma giu nguyen gia tri
      // (`sharedUserId: order?.owner?.slug`) la "SOT 1" cua dot ra 12/09/2026 -
      // TypeScript khong bat duoc vi ca hai la `string`, va hau qua la moi luot
      // tra bang xu bao "het tien".
      await this.sharedBalanceService.validate({
        sharedUserId: order?.owner?.sharedUserId,
        points: order.subtotal,
      })
    ) {
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
}
