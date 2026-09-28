import { Module } from '@nestjs/common';
import { PrinterService } from './printer.service';
import { PrinterManager } from './printer.manager';
import { BullModule } from '@nestjs/bullmq';
import { QueueRegisterKey } from 'src/app/app.constants';
import { PrinterProfile } from './printer.mapper';
import { PrinterUtils } from './printer.utils';
import { PrinterConsumer } from './printer.consumer';
import { PrinterProducer } from './printer.producer';
import { PrinterJob } from './entity/printer-job.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PrinterWorker } from './printer.worker';
import { ChefOrder } from 'src/chef-order/chef-order.entity';
import { PdfService } from 'src/pdf/pdf.service';
import { DbModule } from 'src/db/db.module';
import { Order } from 'src/order/order.entity';
import { InvoiceService } from 'src/invoice/invoice.service';
import { Invoice } from 'src/invoice/invoice.entity';
import { QrCodeService } from 'src/qr-code/qr-code.service';
import { PrinterEvent } from './entity/printer-event.entity';
import { PrinterEventService } from './printer-event/printer-event.service';
import { PrinterEventConsumer } from './printer-event/printer-event.consumer';
import { PrinterEventProducer } from './printer-event/printer-event.producer';
import { PrinterEventLanguageService } from './printer-event/printer-event-language.service';
import { PrinterEventUtils } from './printer-event/printer-event.utils';
import { FirebaseDeviceToken } from 'src/notification/firebase/firebase-device-token.entity';
import { FirebaseService } from 'src/notification/firebase/firebase.service';
import { UserModule } from 'src/user/user.module';
import { User } from 'src/user/user.entity';
import { PrinterController } from './printer.controller';
import { PrinterConnectorModule } from 'src/printer-connector/printer-connector.module';
import { Printer } from './entity/printer.entity';
import { Payment } from 'src/payment/entity/payment.entity';
import { WorkShift } from 'src/work-shift/work-shift.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Printer,
      PrinterJob,
      ChefOrder,
      Order,
      Invoice,
      PrinterEvent,
      FirebaseDeviceToken,
      User,
      Payment,
      WorkShift,
    ]),
    BullModule.registerQueue({
      name: QueueRegisterKey.PRINTER,
    }),
    BullModule.registerQueue({
      name: QueueRegisterKey.PRINTER_EVENT,
    }),
    DbModule,
    UserModule,
    PrinterConnectorModule,
  ],
  controllers: [PrinterController],
  providers: [
    PrinterService,
    PrinterManager,
    PrinterProfile,
    PrinterUtils,
    PrinterConsumer,
    PrinterProducer,
    PrinterWorker,
    PdfService,
    InvoiceService,
    QrCodeService,
    PrinterEventService,
    PrinterEventConsumer,
    PrinterEventProducer,
    PrinterEventLanguageService,
    PrinterEventUtils,
    FirebaseService,
  ],
  exports: [PrinterService, PrinterUtils, PrinterProducer, PrinterEventUtils],
})
export class PrinterModule {}
