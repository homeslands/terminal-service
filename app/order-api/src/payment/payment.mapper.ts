import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import {
  CreatePaymentCallbackRouteRequestDto,
  PaymentBankingBackupResponseDto,
  PaymentCallbackForwardLogResponseDto,
  PaymentCallbackRouteResponseDto,
  PaymentResponseDto,
  UpdatePaymentCallbackRouteRequestDto,
} from './payment.dto';
import { Payment } from './entity/payment.entity';
import { PaymentBankingBackup } from './entity/payment-banking-backup.entity';
import { PaymentCallbackRoute } from './entity/payment-callback-route.entity';
import { PaymentCallbackForwardLog } from './entity/payment-callback-forward-log.entity';
import { OrderPaymentResponseDto } from 'src/order/order.dto';

@Injectable()
export class PaymentProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(mapper, Payment, PaymentResponseDto);
      createMap(mapper, Payment, OrderPaymentResponseDto);
      createMap(mapper, PaymentBankingBackup, PaymentBankingBackupResponseDto);
      createMap(
        mapper,
        CreatePaymentCallbackRouteRequestDto,
        PaymentCallbackRoute,
      );
      createMap(
        mapper,
        UpdatePaymentCallbackRouteRequestDto,
        PaymentCallbackRoute,
      );
      createMap(mapper, PaymentCallbackRoute, PaymentCallbackRouteResponseDto);
      createMap(
        mapper,
        PaymentCallbackForwardLog,
        PaymentCallbackForwardLogResponseDto,
      );
    };
  }
}
