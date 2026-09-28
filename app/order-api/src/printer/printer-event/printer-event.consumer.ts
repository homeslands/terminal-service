import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueRegisterKey } from 'src/app/app.constants';
import { CreatePrinterEventDto } from './printer-event.dto';
import { PrinterEventService } from './printer-event.service';

@Processor(QueueRegisterKey.PRINTER_EVENT)
@Injectable()
export class PrinterEventConsumer extends WorkerHost {
  constructor(private readonly printerEventService: PrinterEventService) {
    super();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async process(job: Job<CreatePrinterEventDto>, token?: string): Promise<any> {
    switch (job.name) {
      case 'create-printer-event':
        const result = await this.printerEventService.create(job.data);

        return result;
    }
  }
}
