import { AutoMap } from '@automapper/classes';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';
import { VatRequestStatus } from './vat-request.constants';

export class CreateVatRequestDto {
  @AutoMap()
  @ApiProperty({ example: 'Công ty ABC' })
  @IsNotEmpty()
  @IsString()
  customerName: string;

  @AutoMap()
  @ApiProperty({ example: '0123456789' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^(\d{10}|\d{13})$/, { message: 'Tax code must be 10 or 13 digits' })
  taxCode: string;

  @AutoMap()
  @ApiProperty({ example: '123 Nguyễn Huệ, Q.1, TP.HCM' })
  @IsNotEmpty()
  @IsString()
  address: string;

  @AutoMap()
  @ApiProperty({ example: 'ketoan@abc.com' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @AutoMap()
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  companyName?: string;

  @AutoMap()
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateVatRequestInfoDto {
  @AutoMap()
  @ApiProperty({ required: false, example: 'Công ty ABC' })
  @IsNotEmpty()
  @IsString()
  customerName?: string;

  @AutoMap()
  @ApiProperty({ required: false, example: '0123456789' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^(\d{10}|\d{13})$/, { message: 'Tax code must be 10 or 13 digits' })
  taxCode?: string;

  @AutoMap()
  @ApiProperty({ required: false, example: '123 Nguyễn Huệ, Q.1, TP.HCM' })
  @IsNotEmpty()
  @IsString()
  address?: string;

  @AutoMap()
  @ApiProperty({ required: false, example: 'ketoan@abc.com' })
  @IsNotEmpty()
  @IsEmail()
  email?: string;

  @AutoMap()
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  companyName?: string;

  @AutoMap()
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateVatRequestStatusDto {
  @AutoMap()
  @ApiProperty({ enum: VatRequestStatus })
  @IsNotEmpty()
  @IsEnum(VatRequestStatus)
  status: VatRequestStatus;

  @AutoMap()
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  invoiceNumber?: string;

  @AutoMap()
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;
}

export class GetVatRequestQueryDto extends BaseQueryDto {
  @AutoMap()
  @ApiProperty({ enum: VatRequestStatus, required: false })
  @IsOptional()
  @IsEnum(VatRequestStatus)
  status?: VatRequestStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  taxCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  referenceNumber?: number;

  @ApiProperty({ required: false, example: '2024-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false, example: '2024-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class VatRequestResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  customerName: string;

  @AutoMap()
  @ApiProperty()
  taxCode: string;

  @AutoMap()
  @ApiProperty()
  address: string;

  @AutoMap()
  @ApiProperty()
  email: string;

  @AutoMap()
  @ApiProperty()
  companyName?: string;

  @AutoMap()
  @ApiProperty()
  note?: string;

  @AutoMap()
  @ApiProperty()
  status: string;

  @AutoMap()
  @ApiProperty()
  invoiceNumber?: string;

  @AutoMap()
  @ApiProperty()
  accountantNote?: string;
}

export class VatRequestAvailabilityResponseDto {
  @ApiProperty()
  invoiceSlug: string;

  @ApiProperty({ enum: ['AVAILABLE', 'SUBMITTED'] })
  status: 'AVAILABLE' | 'SUBMITTED';
}

export class VatLinkResponseDto {
  @ApiProperty()
  url: string;
}
