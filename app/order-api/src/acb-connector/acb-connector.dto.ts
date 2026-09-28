import { AutoMap } from '@automapper/classes';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';
import { BaseResponseDto } from 'src/app/base.dto';
import {
  BENEFICIARY_NAME_INVALID,
  VIRTUAL_ACCOUNT_PREFIX_INVALID,
  X_OWNER_NUMBER_INVALID,
  X_OWNER_TYPE_INVALID,
  X_PROVIDER_ID_INVALID,
  X_SERVICE_INVALID,
} from './acb-connector.validation';

// Request
export class ACBTokenRequestDto {
  client_id: string;
  client_secret: string;
  grant_type: string;
  scope?: string;
}

export class ACBInitiateQRCodeRequestDto {
  requestTrace: string;
  requestDateTime: string;
  requestParameters: ACBInitiateQRCodeRequestParametersDto;
}

export class ACBCancelQRCodeRequestDto {
  requestTrace: string;
  requestDateTime: string;
  requestParameters: ACBCancelQRCodeRequestParametersDto;
}
export class ACBCancelQRCodeRequestParametersDto {
  traceNumber: string;
  orderId: string;
  amount: number;
}

export class ACBInitiateQRCodeRequestParametersDto {
  traceNumber: string;
  merchantId: string;
  terminalId: string;
  userId: string;
  orderId: string;
  virtualAccountPrefix: string;
  beneficiaryName: string;
  amount: number;
  voucherCode: string;
  loyaltyCode: string;
  description: string;
}

export class CreateACBConnectorConfigRequestDto {
  @AutoMap()
  @ApiProperty()
  @IsNotEmpty({ message: X_PROVIDER_ID_INVALID })
  xProviderId: string;

  @AutoMap()
  @ApiProperty()
  @IsNotEmpty({ message: X_SERVICE_INVALID })
  xService: string;

  @AutoMap()
  @ApiProperty()
  @IsNotEmpty({ message: X_OWNER_NUMBER_INVALID })
  xOwnerNumber: string;

  @AutoMap()
  @ApiProperty()
  @IsNotEmpty({ message: X_OWNER_TYPE_INVALID })
  xOwnerType: string;

  @AutoMap()
  @ApiProperty()
  @IsNotEmpty({ message: BENEFICIARY_NAME_INVALID })
  beneficiaryName: string;

  @AutoMap()
  @ApiProperty()
  @IsNotEmpty({ message: VIRTUAL_ACCOUNT_PREFIX_INVALID })
  virtualAccountPrefix: string;
}

export class UpdateACBConnectorConfigRequestDto extends CreateACBConnectorConfigRequestDto {}

export class ACBTransactionEntityAttributeDto {
  @ApiProperty()
  traceNumber: string;

  @ApiProperty()
  beneficiaryName: string;

  @ApiProperty()
  virtualAccount: string;

  @ApiProperty()
  custom1: string;
}

export class ACBTransactionDto {
  @ApiProperty()
  transactionStatus: string;

  @ApiProperty()
  transactionChannel: string;

  @ApiProperty()
  transactionDate: string;

  @ApiProperty()
  effectiveDate: string;

  @ApiProperty()
  debitOrCredit: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  transactionContent: string;

  @ApiProperty()
  transactionEntityAttribute: ACBTransactionEntityAttributeDto;
}

export class ACBRequestParamsDto {
  @ApiProperty()
  transactions: ACBTransactionDto[];
}

export class ACBRequestDto {
  @ApiProperty()
  requestParams: ACBRequestParamsDto;
}

export class ACBRequestParametersDto {
  @ApiProperty()
  request: ACBRequestDto;
}

export class ACBStatusRequestDto {
  @ApiProperty()
  requestTrace: string;

  @ApiProperty()
  responseDateTime: string;

  @ApiProperty()
  requestParameters: ACBRequestParametersDto;
}

// QR transaction notification (thông báo danh sách giao dịch QR Code)
export class ACBQrTransactionMasterMetaDto {
  @ApiProperty()
  clientId: string;

  @ApiProperty()
  clientRequestId: string;

  @ApiProperty()
  checksum: string;
}

export class ACBQrTransactionRequestMetaDto {
  @ApiProperty()
  requestType: string;

  @ApiProperty()
  requestCode: string;
}

export class ACBQrTransactionEntityAttributeDto {
  @ApiProperty()
  traceNumber: string;

  @ApiProperty()
  beneficiaryName: string;

  @ApiProperty()
  beneficiaryAccountNumber: string;

  @ApiProperty()
  receiverBankName: string;

  @ApiProperty()
  virtualAccount: string;

  @ApiProperty()
  referenceNumber: string;

  @ApiProperty()
  partnerCustomerCode: string;

  @ApiProperty()
  partnerCustomerName: string;

  @ApiProperty()
  partnerCustomerType: string;
}

export class ACBQrTransactionDto {
  @ApiProperty()
  transactionStatus: string;

  @ApiProperty()
  transactionChannel: string;

  @ApiProperty()
  transactionDate: string;

  @ApiProperty()
  effectiveDate: string;

  @ApiProperty()
  debitOrCredit: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  transactionEntityAttribute: ACBQrTransactionEntityAttributeDto;

  @ApiProperty()
  transactionContent: string;
}

export class ACBQrTransactionPaginationDto {
  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;

  @ApiProperty()
  totalPage: number;
}

export class ACBQrTransactionRequestParamsDto {
  @ApiProperty()
  transactions: ACBQrTransactionDto[];

  @ApiProperty()
  pagination: ACBQrTransactionPaginationDto;
}

export class ACBQrTransactionRequestDto {
  @ApiProperty()
  requestMeta: ACBQrTransactionRequestMetaDto;

  @ApiProperty()
  requestParams: ACBQrTransactionRequestParamsDto;
}

export class ACBQrTransactionRequestParametersDto {
  @ApiProperty()
  masterMeta: ACBQrTransactionMasterMetaDto;

  @ApiProperty()
  request: ACBQrTransactionRequestDto;
}

export class ACBQrTransactionNotificationRequestDto {
  @ApiProperty()
  requestTrace: string;

  @ApiProperty()
  requestDateTime: string;

  @ApiProperty()
  requestParameters: ACBQrTransactionRequestParametersDto;
}

// Response
export class ACBResponseStatusDto {
  @ApiProperty()
  responseCode: string;

  @ApiProperty()
  responseMessage: string;
}

export class ACBResponseBodyDto {
  @ApiProperty()
  index: number;

  @ApiProperty()
  referenceCode: string;
}

export class ACBResponseDto {
  @ApiProperty()
  requestTrace: string;

  @ApiProperty()
  responseDateTime: string;

  @ApiProperty()
  responseStatus: ACBResponseStatusDto;

  @ApiProperty()
  responseBody: ACBResponseBodyDto;
}

export class ACBTokenResponseDto {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: string;
  session_state: string;
  scope: string;
}

export class ACBInitiateQRCodeResponseDto {
  requestTrace: string;
  responseDateTime: string;
  responseStatus: ACBResponseStatusDto;
  responseBody: ACBInitiateQRCodeResponseBodyDto;
}

export class ACBInitiateQRCodeResponseBodyDto {
  virtualAccount: string;
  traceNumber: string;
  qrDataUrl: string;
}

export class ACBCancelQRCodeResponseDto {
  requestTrace: string;
  responseDateTime: string;
  responseStatus: ACBResponseStatusDto;
  responseBody: ACBCancelQRCodeResponseBodyDto;
}

export class ACBCancelQRCodeResponseBodyDto {
  traceNumber: string;
  orderId: string;
  amount: number;
  status: string;
}

// Retrieve QR Code (query danh sách giao dịch QR Code)
export class ACBRetrieveQRCodeRequestDto {
  fromDate: string;
  toDate: string;
  merchantId?: string;
  orderId?: string;
  virtualAccount?: string;
  traceNumber?: string;
  page?: number;
  size?: number;
}

export class ACBRetrieveQRCodeTransactionDetailDto {
  @ApiProperty()
  transactionNumber: number;

  @ApiProperty()
  transactionAmount: number;

  @ApiProperty()
  transactionContent: string;

  @ApiProperty()
  transactionStatus: string;

  @ApiProperty()
  origPostDate: string;
}

export class ACBRetrieveQRCodeOrderDto {
  @ApiProperty()
  traceNumber: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  merchantId: string;

  @ApiProperty()
  terminalId: string;

  @ApiProperty()
  orderId: string;

  @ApiProperty()
  virtualAccount: string;

  @ApiProperty()
  beneficiaryName: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  voucherCode: string;

  @ApiProperty()
  loyaltyCode: string;

  @ApiProperty()
  createdDatetime: string;

  @ApiProperty({ type: [ACBRetrieveQRCodeTransactionDetailDto] })
  transactionDetail: ACBRetrieveQRCodeTransactionDetailDto[];
}

export class ACBRetrieveQRCodePaginationDto {
  @ApiProperty()
  totalRows: number;

  @ApiProperty()
  totalPages: number;
}

export class ACBRetrieveQRCodeResponseBodyDto {
  @ApiProperty({ type: [ACBRetrieveQRCodeOrderDto] })
  orders: ACBRetrieveQRCodeOrderDto[];

  @ApiProperty()
  pagination: ACBRetrieveQRCodePaginationDto;
}

export class ACBRetrieveQRCodeResponseDto {
  requestTrace: string;
  responseDateTime: string;
  responseStatus: ACBResponseStatusDto;
  responseBody: ACBRetrieveQRCodeResponseBodyDto;
}

export class ACBConnectorConfigResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  xProviderId: string;

  @AutoMap()
  @ApiProperty()
  xService: string;

  @AutoMap()
  @ApiProperty()
  xOwnerNumber: string;

  @AutoMap()
  @ApiProperty()
  xOwnerType: string;

  @AutoMap()
  @ApiProperty()
  beneficiaryName: string;

  @AutoMap()
  @ApiProperty()
  virtualAccountPrefix: string;
}
