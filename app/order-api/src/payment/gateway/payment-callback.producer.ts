import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QueueRegisterKey } from 'src/app/app.constants';
import { PAYMENT_CALLBACK_PROCESS_JOB } from '../payment.constants';
import { ProcessPaymentCallbackJobDto } from '../payment.dto';

@Injectable()
export class PaymentCallbackProducer {
  constructor(
    @InjectQueue(QueueRegisterKey.PAYMENT_CALLBACK)
    private readonly paymentCallbackQueue: Queue,
  ) {}

  async enqueueProcessCallback(data: ProcessPaymentCallbackJobDto) {
    await this.paymentCallbackQueue.add(PAYMENT_CALLBACK_PROCESS_JOB, data, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }
}
