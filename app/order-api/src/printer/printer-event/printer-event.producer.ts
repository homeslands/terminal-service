import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QueueRegisterKey } from 'src/app/app.constants';
import { CREATE_PRINTER_EVENT_JOB } from './printer-event.constants';
import { CreatePrinterEventDto } from './printer-event.dto';

@Injectable()
export class PrinterEventProducer {
  constructor(
    @InjectQueue(QueueRegisterKey.PRINTER_EVENT)
    private printerEventQueue: Queue,
  ) {}

  async createPrinterEvent(data: CreatePrinterEventDto) {
    this.printerEventQueue.add(CREATE_PRINTER_EVENT_JOB, data);
  }

  async bulkCreatePrinterEvent(data: CreatePrinterEventDto[]) {
    this.printerEventQueue.addBulk(
      data.map((item) => ({
        name: CREATE_PRINTER_EVENT_JOB,
        data: item,
      })),
    );
  }
}
