import { SharedUserServiceModule } from 'src/external-services/shared-user-service/shared-user-service.module';
import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { BankTransferStrategy } from './strategy/bank-transfer.strategy';
import { InternalStrategy } from './strategy/internal.strategy';
import { CashStrategy } from './strategy/cash.strategy';
import { PaymentProfile } from './payment.mapper';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entity/payment.entity';
import { PaymentBankingBackup } from './entity/payment-banking-backup.entity';
import { PaymentCallbackRoute } from './entity/payment-callback-route.entity';
import { PaymentCallbackForwardLog } from './entity/payment-callback-forward-log.entity';
import { PaymentCallbackInbox } from './gateway/entity/payment-callback-inbox.entity';
import { PaymentCallbackRouteClient } from './payment-callback-route.client';
import { PaymentCallbackProducer } from './gateway/payment-callback.producer';
import { PaymentCallbackConsumer } from './gateway/payment-callback.consumer';
import { BullModule } from '@nestjs/bullmq';
import { QueueRegisterKey } from 'src/app/app.constants';
import { HttpModule } from '@nestjs/axios';
import { ACBConnectorModule } from 'src/acb-connector/acb-connector.module';
import { Order } from 'src/order/order.entity';
import { ACBConnectorConfig } from 'src/acb-connector/acb-connector.entity';
import { PdfModule } from 'src/pdf/pdf.module';
import { UserUtils } from 'src/user/user.utils';
import { User } from 'src/user/user.entity';
import { PaymentUtils } from './payment.utils';
import { DbModule } from 'src/db/db.module';
import { PointStrategy } from './strategy/point.strategy';
import { SharedModule } from 'src/shared/shared.module';
import { VoucherModule } from 'src/voucher/voucher.module';
import { OrderUtils } from 'src/order/order.utils';
import { OrderItemUtils } from 'src/order-item/order-item.utils';
import { Invoice } from 'src/invoice/invoice.entity';
import { MenuItemUtils } from 'src/menu-item/menu-item.utils';
import { OrderItem } from 'src/order-item/order-item.entity';
import { MenuItem } from 'src/menu-item/menu-item.entity';
import { Menu } from 'src/menu/menu.entity';
import { MenuUtils } from 'src/menu/menu.utils';
import { Voucher } from 'src/voucher/entity/voucher.entity';
import { AccumulatedPointService } from 'src/accumulated-point/accumulated-point.service';
import { AccumulatedPoint } from 'src/accumulated-point/entities/accumulated-point.entity';
import { AccumulatedPointTransactionHistory } from 'src/accumulated-point/entities/accumulated-point-transaction-history.entity';
import { CreditCardStrategy } from './strategy/credit-card.strategy';
import { MembershipCard } from 'src/membership-card/membership-card.entity';
import { PrinterConnectorModule } from 'src/printer-connector/printer-connector.module';
import { Printer } from 'src/printer/entity/printer.entity';
import { PrinterModule } from 'src/printer/printer.module';
import { QrPaymentModule } from 'src/qr-payment/qr-payment.module';
import { ApiKeyGuard } from './guard/api-key.guard';
import { WorkShift } from 'src/work-shift/work-shift.entity';

@Module({
  imports: [
    SharedUserServiceModule,
    HttpModule,
    BullModule.registerQueue({
      name: QueueRegisterKey.PAYMENT_CALLBACK,
    }),
    TypeOrmModule.forFeature([
      Payment,
      PaymentBankingBackup,
      PaymentCallbackRoute,
      PaymentCallbackForwardLog,
      PaymentCallbackInbox,
      Order,
      ACBConnectorConfig,
      User,
      Invoice,
      OrderItem,
      MenuItem,
      Menu,
      Voucher,
      AccumulatedPoint,
      AccumulatedPointTransactionHistory,
      MembershipCard,
      Printer,
      WorkShift,
    ]),
    ACBConnectorModule,
    PdfModule,
    DbModule,
    SharedModule,
    VoucherModule,
    PrinterConnectorModule,
    PrinterModule,
    QrPaymentModule,
  ],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    PaymentProfile,
    BankTransferStrategy,
    CashStrategy,
    InternalStrategy,
    PointStrategy,
    UserUtils,
    PaymentUtils,
    OrderUtils,
    OrderItemUtils,
    MenuItemUtils,
    MenuUtils,
    AccumulatedPointService,
    CreditCardStrategy,
    ApiKeyGuard,
    PaymentCallbackRouteClient,
    PaymentCallbackProducer,
    PaymentCallbackConsumer,
  ],
  exports: [PaymentService, PaymentUtils],
})
export class PaymentModule {}
