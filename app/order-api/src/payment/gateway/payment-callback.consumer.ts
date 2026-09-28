import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueRegisterKey } from 'src/app/app.constants';
import { PaymentService } from '../payment.service';
import { ProcessPaymentCallbackJobDto } from '../payment.dto';
import { PAYMENT_CALLBACK_PROCESS_JOB } from '../payment.constants';

@Processor(QueueRegisterKey.PAYMENT_CALLBACK)
@Injectable()
export class PaymentCallbackConsumer extends WorkerHost {
  constructor(private readonly paymentService: PaymentService) {
    super();
  }

  async process(job: Job<ProcessPaymentCallbackJobDto>): Promise<void> {
    switch (job.name) {
      case PAYMENT_CALLBACK_PROCESS_JOB:
        await this.paymentService.processCallbackJob(job.data);
        return;
    }
  }
}
