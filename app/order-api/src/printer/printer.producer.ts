import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QueueRegisterKey } from 'src/app/app.constants';
import { CreatePrintJobRequestDto } from './printer.dto';
@Injectable()
export class PrinterProducer {
  constructor(
    @InjectQueue(QueueRegisterKey.PRINTER)
    private readonly printerQueue: Queue,
  ) {}

  async createPrintJob(data: CreatePrintJobRequestDto) {
    await this.printerQueue.add(`print:${data.printerIp}`, data);
  }

  async enqueuePrinterJob(printerJobId: string) {
    await this.printerQueue.add(
      `printer-job:${printerJobId}`,
      { printerJobId },
      {
        jobId: printerJobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }
}
