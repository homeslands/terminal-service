import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
  IsIn,
  Min,
  IsDate,
  IsBoolean,
  IsNumber,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { CampaignStatus, CampaignType } from './campaign.constants';
import { PaymentMethod } from 'src/payment/payment.constants';
import { Transform, Type } from 'class-transformer';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';
import {
  VoucherApplicabilityRule,
  VoucherType,
  VoucherUsageFrequencyUnit,
} from 'src/voucher/voucher.constant';

export class CampaignKeyResponseDto {
  key: string;
}

export class CreateVoucherCampaignTemplateDto {
  @ApiProperty({ example: 'Voucher giảm giá 10%' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 30, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  duration?: number | null;

  @ApiProperty({ example: 10 })
  @IsNotEmpty()
  @IsNumber()
  value: number;

  @ApiProperty({
    example: VoucherType.PERCENT_ORDER,
    enum: VoucherType,
    required: false,
  })
  @IsOptional()
  @IsEnum(VoucherType)
  type?: string;

  @ApiProperty({ example: 1 })
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  maxUsage: number;

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderValue?: number;

  @ApiProperty({
    example: VoucherApplicabilityRule.ALL_REQUIRED,
    enum: VoucherApplicabilityRule,
  })
  @IsNotEmpty()
  @IsEnum(VoucherApplicabilityRule)
  applicabilityRule: string;

  @ApiProperty({
    example: VoucherUsageFrequencyUnit.UNLIMITED,
    enum: VoucherUsageFrequencyUnit,
  })
  @IsNotEmpty()
  @IsEnum(VoucherUsageFrequencyUnit)
  usageFrequencyUnit: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  usageFrequencyValue?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxItems?: number;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray({ message: 'The array of the payment methods must be an array' })
  @IsString({
    each: true,
    message: 'Each payment method in the array must be a string',
  })
  @IsIn(Object.values(PaymentMethod), {
    each: true,
    message: `Each payment method must be one of: ${Object.values(PaymentMethod).join(', ')}`,
  })
  @Type(() => String)
  paymentMethods?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray({ message: 'The slug array of the products must be an array' })
  @IsString({ each: true, message: 'Each slug in the array must be a string' })
  @Type(() => String)
  productSlugs?: string[];
}

export class UpdateVoucherCampaignTemplateDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  duration?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  value?: number;

  @ApiProperty({ enum: VoucherType, required: false })
  @IsOptional()
  @IsEnum(VoucherType)
  type?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxUsage?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderValue?: number;

  @ApiProperty({ enum: VoucherApplicabilityRule, required: false })
  @IsOptional()
  @IsEnum(VoucherApplicabilityRule)
  applicabilityRule?: string;

  @ApiProperty({ enum: VoucherUsageFrequencyUnit, required: false })
  @IsOptional()
  @IsEnum(VoucherUsageFrequencyUnit)
  usageFrequencyUnit?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  usageFrequencyValue?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxItems?: number;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray({ message: 'The array of the payment methods must be an array' })
  @IsString({
    each: true,
    message: 'Each payment method in the array must be a string',
  })
  @IsIn(Object.values(PaymentMethod), {
    each: true,
    message: `Each payment method must be one of: ${Object.values(PaymentMethod).join(', ')}`,
  })
  @Type(() => String)
  paymentMethods?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray({ message: 'The slug array of the products must be an array' })
  @IsString({ each: true, message: 'Each slug in the array must be a string' })
  @Type(() => String)
  productSlugs?: string[];
}

export class VoucherCampaignTemplateResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  title: string;

  @AutoMap()
  @ApiProperty({ required: false })
  description?: string;

  @AutoMap()
  @ApiProperty()
  duration: number;

  @AutoMap()
  @ApiProperty()
  value: number;

  @AutoMap()
  @ApiProperty()
  type: string;

  @AutoMap()
  @ApiProperty()
  maxUsage: number;

  @AutoMap()
  @ApiProperty()
  minOrderValue: number;

  @AutoMap()
  @ApiProperty()
  applicabilityRule: string;

  @AutoMap()
  @ApiProperty()
  usageFrequencyUnit: string;

  @AutoMap()
  @ApiProperty({ required: false })
  usageFrequencyValue?: number;

  @AutoMap()
  @ApiProperty({ required: false })
  maxItems?: number;

  @AutoMap()
  @ApiProperty({ required: false, type: [String] })
  paymentMethods?: string[];

  @AutoMap()
  @ApiProperty({ required: false, type: [String] })
  productSlugs?: string[];
}

export class CreateCampaignRequestDto {
  @AutoMap()
  @ApiProperty({ example: 'Chào mừng thành viên mới' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @AutoMap()
  @ApiProperty({ example: 'new-user', enum: CampaignType })
  @IsNotEmpty()
  @IsEnum(CampaignType)
  type: string;

  @AutoMap()
  @ApiProperty({ example: 100, required: false })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  recipientLimit?: number;

  @AutoMap()
  @ApiProperty({ example: '2024-01-01' })
  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  startDate: Date;

  @AutoMap()
  @ApiProperty({ example: '2024-12-31', required: false })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;

  @ApiProperty({ example: 'voucher-group-slug' })
  @IsNotEmpty()
  @IsString()
  voucherGroupSlug: string;

  @ApiProperty({
    required: false,
    type: () => CreateVoucherCampaignTemplateDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateVoucherCampaignTemplateDto)
  voucherCampaignTemplate?: CreateVoucherCampaignTemplateDto;
}

export class UpdateCampaignRequestDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ enum: CampaignStatus, required: false })
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  recipientLimit?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  voucherGroupSlug?: string;

  @ApiProperty({
    required: false,
    type: () => UpdateVoucherCampaignTemplateDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateVoucherCampaignTemplateDto)
  voucherCampaignTemplate?: UpdateVoucherCampaignTemplateDto;
}

export class GetAllCampaignQueryRequestDto extends BaseQueryDto {
  @ApiProperty({ enum: CampaignType, required: false })
  @IsOptional()
  @IsEnum(CampaignType)
  type?: string;

  @ApiProperty({ enum: CampaignStatus, required: false })
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return true;
    return value === 'true' || value === true;
  })
  hasPaging?: boolean = true;
}

export class CampaignResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  name: string;

  @AutoMap()
  @ApiProperty()
  type: string;

  @AutoMap()
  @ApiProperty()
  status: string;

  @AutoMap()
  @ApiProperty({ required: false })
  recipientLimit?: number;

  @AutoMap()
  @ApiProperty()
  startDate: Date;

  @AutoMap()
  @ApiProperty({ required: false })
  endDate?: Date;

  @ApiProperty({ required: false })
  voucherGroup?: { slug: string; title: string };

  @ApiProperty({
    required: false,
    type: () => VoucherCampaignTemplateResponseDto,
  })
  voucherCampaignTemplate?: VoucherCampaignTemplateResponseDto;
}
