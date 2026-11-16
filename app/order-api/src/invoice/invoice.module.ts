import { Module } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { InvoiceController } from './invoice.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from './invoice.entity';
import { Order } from 'src/order/order.entity';
import { InvoiceProfile } from './invoice.mapper';
import { PdfModule } from 'src/pdf/pdf.module';
import { QrCodeModule } from 'src/qr-code/qr-code.module';
import { InvoiceScheduler } from './invoice.scheduler';
import { DbModule } from 'src/db/db.module';
import { InvoiceListener } from './invoice.listener';
import { PrinterModule } from 'src/printer/printer.module';
import { PrinterConnectorModule } from 'src/printer-connector/printer-connector.module';
import { SharedUserServiceModule } from 'src/external-services/shared-user-service/shared-user-service.module';
import { Printer } from 'src/printer/entity/printer.entity';
import { WorkShift } from 'src/work-shift/work-shift.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([Invoice, Order, Printer, WorkShift]),
    PdfModule,
    QrCodeModule,
    DbModule,
    PrinterModule,
    PrinterConnectorModule,
    // InvoiceService lay ten nguoi mua + thu ngan tu shared-user (buoc 4.5).
    SharedUserServiceModule,
  ],
  controllers: [InvoiceController],
  providers: [
    InvoiceService,
    InvoiceProfile,
    InvoiceScheduler,
    InvoiceListener,
  ],
  exports: [InvoiceService],
})
export class InvoiceModule {}
