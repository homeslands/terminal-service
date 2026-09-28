import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';
import { BranchResponseDto } from 'src/branch/branch.dto';
import { WorkShiftStatus } from './work-shift.constants';

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

export class OpenWorkShiftRequestDto {
  @ApiProperty({ example: 500000 })
  @IsNumber()
  @Min(0)
  openingCash: number;
}

export class CloseWorkShiftRequestDto {
  @ApiProperty({ example: 600000, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  closingCash?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  note?: string;
}

export class ForceCloseWorkShiftRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  note: string;
}

export class GetWorkShiftsQueryDto extends BaseQueryDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  cashierSlug?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  branchSlug?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  endDate?: string;

  @ApiProperty({ required: false, enum: WorkShiftStatus })
  @IsEnum(WorkShiftStatus)
  @IsOptional()
  status?: WorkShiftStatus;
}

// ---------------------------------------------------------------------------
// Sub-response DTOs
// ---------------------------------------------------------------------------

export class UserBasicDto {
  slug: string;
  firstName: string;
  lastName: string;
  phonenumber: string;
}

const PAYMENT_METHOD_DISPLAY_NAMES: Record<string, string> = {
  cash: 'Tiền mặt',
  'bank-transfer': 'Chuyển khoản',
  'credit-card': 'Thẻ tín dụng',
  point: 'Xu',
};

export function getPaymentMethodDisplayName(method: string): string {
  return PAYMENT_METHOD_DISPLAY_NAMES[method] ?? method;
}

export class PaymentMethodSummaryDto {
  paymentMethod: string;
  displayName: string;
  totalAmount: number;
  invoiceCount: number;
}

export class ShiftStaffSummaryDto {
  staff: UserBasicDto;
  totalOrdersCreated: number;
  totalOrdersRevenue: number;
}

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

export class WorkShiftBasicResponseDto extends BaseResponseDto {
  cashier: UserBasicDto;
  branch: BranchResponseDto;
  actualStartTime: Date;
  actualEndTime: Date | null;
  status: WorkShiftStatus;
  openingCash: number;
  closingCash: number | null;
  note: string | null;
}

export class WorkShiftResponseDto extends WorkShiftBasicResponseDto {
  totalOrders: number;
  totalInvoicesPaid: number;
  totalRevenue: number;
  preShiftOrdersLinked?: number;
}

export class WorkShiftSummaryResponseDto {
  workShift: WorkShiftBasicResponseDto;
  openingCash: number;
  closingCash: number | null;
  cashRevenue: number;
  cashDifference: number | null;
  paymentSummary: PaymentMethodSummaryDto[];
  totalRevenue: number;
  totalOrders: number;
  totalInvoicesPaid: number;
  crossShiftOrdersCount: number;
  staffSummary: ShiftStaffSummaryDto[];
  totalStaffWorked: number;
}

export class WorkShiftListResponseDto {
  data: WorkShiftResponseDto[];
  total: number;
  page: number;
  size: number;
}
