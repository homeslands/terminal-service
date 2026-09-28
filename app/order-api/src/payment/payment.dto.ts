import { AutoMap } from '@automapper/classes';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';
import { PaymentCallbackServiceType, PaymentMethod } from './payment.constants';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  Min,
  ValidateIf,
} from 'class-validator';
import { CREDIT_CARD_TRANSACTION_ID_REQUIRED } from './payment.validation';
import { INVALID_ORDER_SLUG } from 'src/order/order.validation';
import { Optional } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ACBStatusRequestDto,
  ACBTransactionDto,
} from 'src/acb-connector/acb-connector.dto';

export class CreatePaymentDto {
  @AutoMap()
  @ApiProperty()
  @ApiProperty({
    example: 'bank-transfer',
    description: 'Payment method',
    enum: PaymentMethod,
  })
  @IsEnum(PaymentMethod)
  paymentMethod: string;

  @AutoMap()
  @ApiProperty()
  @IsNotEmpty({
    message: INVALID_ORDER_SLUG,
  })
  orderSlug: string;

  @AutoMap()
  @ApiProperty()
  @ValidateIf((o) => o.paymentMethod === PaymentMethod.CREDIT_CARD)
  @IsNotEmpty({
    message: CREDIT_CARD_TRANSACTION_ID_REQUIRED,
  })
  transactionId?: string;

  @AutoMap()
  @ApiProperty()
  @Optional()
  membershipCard?: string;

  @AutoMap()
  @ApiProperty({
    required: false,
    description:
      'Raw QR token from QR scan flow. When set, PaymentService.initiate will delegate QR authentication to QrPaymentService.verify and bypass membershipCard validation.',
  })
  @Optional()
  qrToken?: string;
}

export class GetSpecificPaymentRequestDto {
  @AutoMap()
  @ApiProperty({ description: 'Request trace' })
  transaction: string;
}

export class RetrieveQrTransactionRequestDto {
  @AutoMap()
  @ApiProperty({ description: 'From date, format: YYYY-MM-DD' })
  @IsNotEmpty()
  fromDate: string;

  @AutoMap()
  @ApiProperty({ description: 'To date, format: YYYY-MM-DD' })
  @IsNotEmpty()
  toDate: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Merchant id' })
  @IsOptional()
  merchantId?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Order id' })
  @IsOptional()
  orderId?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Virtual account' })
  @IsOptional()
  virtualAccount?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Trace number' })
  @IsOptional()
  traceNumber?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Page number', example: 0 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  page?: number;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Page size', example: 20 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  size?: number;
}

export class GetPaymentBankingBackupRequestDto extends BaseQueryDto {
  @AutoMap()
  @ApiPropertyOptional({ description: 'Trace number' })
  @IsOptional()
  traceNumber?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Payment id' })
  @IsOptional()
  paymentId?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Transaction status' })
  @IsOptional()
  transactionStatus?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'From created date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @AutoMap()
  @ApiPropertyOptional({ description: 'To created date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}

export class PaymentBankingBackupResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiPropertyOptional()
  traceNumber?: string;

  @AutoMap()
  @ApiPropertyOptional()
  transactionStatus?: string;

  @AutoMap()
  @ApiPropertyOptional()
  transactionChannel?: string;

  @AutoMap()
  @ApiPropertyOptional()
  transactionDate?: string;

  @AutoMap()
  @ApiPropertyOptional()
  effectiveDate?: string;

  @AutoMap()
  @ApiPropertyOptional()
  debitOrCredit?: string;

  @AutoMap()
  @ApiPropertyOptional()
  amount?: number;

  @AutoMap()
  @ApiPropertyOptional()
  transactionContent?: string;

  @AutoMap()
  @ApiPropertyOptional()
  beneficiaryName?: string;

  @AutoMap()
  @ApiPropertyOptional()
  beneficiaryAccountNumber?: string;

  @AutoMap()
  @ApiPropertyOptional()
  receiverBankName?: string;

  @AutoMap()
  @ApiPropertyOptional()
  virtualAccount?: string;

  @AutoMap()
  @ApiPropertyOptional()
  referenceNumber?: string;

  @AutoMap()
  @ApiPropertyOptional()
  partnerCustomerCode?: string;

  @AutoMap()
  @ApiPropertyOptional()
  partnerCustomerName?: string;

  @AutoMap()
  @ApiPropertyOptional()
  partnerCustomerType?: string;

  @AutoMap()
  @ApiPropertyOptional()
  paymentId?: string;

  @AutoMap()
  @ApiPropertyOptional()
  rawPayload?: string;
}

export class GetPaymentCallbackForwardLogRequestDto extends BaseQueryDto {
  @AutoMap()
  @ApiPropertyOptional({ description: 'Route code (custom1)' })
  @IsOptional()
  routeCode?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Trace number' })
  @IsOptional()
  traceNumber?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Transaction status' })
  @IsOptional()
  transactionStatus?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'From created date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @AutoMap()
  @ApiPropertyOptional({ description: 'To created date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}

export class PaymentCallbackForwardLogResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiPropertyOptional()
  routeCode?: string;

  @AutoMap()
  @ApiPropertyOptional()
  targetUrl?: string;

  @AutoMap()
  @ApiPropertyOptional()
  traceNumber?: string;

  @AutoMap()
  @ApiPropertyOptional()
  transactionStatus?: string;

  @AutoMap()
  @ApiPropertyOptional()
  transactionChannel?: string;

  @AutoMap()
  @ApiPropertyOptional()
  transactionDate?: string;

  @AutoMap()
  @ApiPropertyOptional()
  effectiveDate?: string;

  @AutoMap()
  @ApiPropertyOptional()
  debitOrCredit?: string;

  @AutoMap()
  @ApiPropertyOptional()
  amount?: number;

  @AutoMap()
  @ApiPropertyOptional()
  transactionContent?: string;

  @AutoMap()
  @ApiPropertyOptional()
  beneficiaryName?: string;

  @AutoMap()
  @ApiPropertyOptional()
  virtualAccount?: string;

  @AutoMap()
  @ApiPropertyOptional()
  rawPayload?: string;
}

export class PaymentResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  paymentMethod: string;

  @AutoMap()
  @ApiProperty()
  amount: number;

  @AutoMap()
  @ApiProperty()
  loss: number;

  @AutoMap()
  @ApiProperty()
  message: string;

  @AutoMap()
  @ApiProperty()
  transactionId: string;

  @AutoMap()
  @ApiProperty()
  qrCode: string;

  @AutoMap()
  @ApiProperty()
  userId: string;

  @AutoMap()
  @ApiProperty()
  statusCode: string;

  @AutoMap()
  @ApiProperty()
  statusMessage: string;
}

export class CreatePaymentCallbackRouteRequestDto {
  @AutoMap()
  @ApiProperty({
    description: 'Value matching custom1 sent by the bank in the callback',
  })
  @IsNotEmpty()
  code: string;

  @AutoMap()
  @ApiProperty({
    example: PaymentCallbackServiceType.INTERNAL,
    description: 'internal: handled by this terminal, external: forwarded',
    enum: PaymentCallbackServiceType,
  })
  @IsEnum(PaymentCallbackServiceType)
  serviceType: string;

  @AutoMap()
  @ApiPropertyOptional()
  @ValidateIf((o) => o.serviceType === PaymentCallbackServiceType.EXTERNAL)
  @IsNotEmpty()
  targetUrl?: string;

  @AutoMap()
  @ApiPropertyOptional()
  @IsOptional()
  targetApiKey?: string;

  @AutoMap()
  @ApiPropertyOptional({ example: 15000 })
  @IsOptional()
  @Type(() => Number)
  timeoutMs?: number;

  @AutoMap()
  @ApiPropertyOptional()
  @IsOptional()
  description?: string;
}

export class UpdatePaymentCallbackRouteRequestDto extends CreatePaymentCallbackRouteRequestDto {
  @AutoMap()
  @ApiPropertyOptional()
  @IsOptional()
  isActive?: boolean;
}

export class PaymentCallbackRouteResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  code: string;

  @AutoMap()
  @ApiProperty()
  serviceType: string;

  @AutoMap()
  @ApiPropertyOptional()
  targetUrl?: string;

  @AutoMap()
  @ApiPropertyOptional()
  targetApiKey?: string;

  @AutoMap()
  @ApiProperty()
  timeoutMs: number;

  @AutoMap()
  @ApiProperty()
  isActive: boolean;

  @AutoMap()
  @ApiPropertyOptional()
  description?: string;
}

export class ProcessPaymentCallbackJobDto {
  inboxId: string;
  routeCode?: string;
  transaction: ACBTransactionDto;
  requestData: ACBStatusRequestDto;
}
