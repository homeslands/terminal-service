import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { PrinterLegacyWorker } from './printer-legacy.worker';
import { PrinterJob } from 'src/printer/entity/printer-job.entity';
import { ChefOrder } from 'src/chef-order/chef-order.entity';
import { Order } from 'src/order/order.entity';
import { QueueRegisterKey } from 'src/app/app.constants';
import { DbModule } from 'src/db/db.module';
import { PdfModule } from 'src/pdf/pdf.module';
import { PrinterModule } from 'src/printer/printer.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PrinterJob, ChefOrder, Order]),
    BullModule.registerQueue({
      name: QueueRegisterKey.PRINTER,
    }),
    DbModule,
    PdfModule,
    PrinterModule,
  ],
  providers: [PrinterLegacyWorker],
})
export class PrinterLegacyModule {}
