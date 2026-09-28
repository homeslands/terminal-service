import { AutoMap } from '@automapper/classes';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Validate,
} from 'class-validator';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';
import { BookingStatus } from './table-booking.constants';
import {
  BOOKING_DATE_FORMAT,
  DateValidation,
} from './table-booking.validation';
import { Transform } from 'class-transformer';
export class TableBookingResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  name: string;

  @AutoMap()
  @ApiProperty()
  phone: string;

  @AutoMap()
  @ApiProperty()
  email?: string;

  @ApiProperty({ example: '24/06/2026 18:00' })
  date: string;

  @AutoMap()
  @ApiProperty()
  seats: number;

  @AutoMap()
  @ApiProperty()
  table: number;

  @AutoMap()
  @ApiProperty()
  deposit: number;

  @AutoMap()
  @ApiProperty()
  status: BookingStatus;

  @AutoMap()
  @ApiProperty()
  note?: string;
}
export class CreateTableBookingDto {
  @AutoMap()
  @ApiProperty()
  @IsNotEmpty({ message: 'Name is required' })
  @IsString()
  name: string;

  @AutoMap()
  @ApiProperty({ example: '0123456789' })
  @IsNotEmpty({ message: 'Phone is required' })
  @IsString()
  @Matches(/^0\d{9}$/, {
    message: 'Invalid phone format 0xxxxxxxxx',
  })
  phone: string;

  @AutoMap()
  @ApiProperty({ required: false, example: 'example@gmail.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Email is invalid' })
  email?: string;

  @AutoMap()
  @ApiProperty({ example: '24/06/2026 18:00' })
  @IsNotEmpty({ message: 'Date is required' })
  @IsString()
  @Matches(
    /^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/(19|20)\d{2} ([01]\d|2[0-3]):[0-5]\d$/,
    {
      message: `Date must be in ${BOOKING_DATE_FORMAT} format`,
    },
  )
  @Validate(DateValidation)
  date: string;

  @AutoMap()
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  seats?: number;

  @AutoMap()
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateTableBookingDto {
  @AutoMap()
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @AutoMap()
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @AutoMap()
  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail({}, { message: 'Email is invalid' })
  email?: string;

  @AutoMap()
  @ApiProperty({ required: false, example: '24/06/2026 18:00' })
  @IsOptional()
  @IsString()
  @Matches(
    /^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/(19|20)\d{2} ([01]\d|2[0-3]):[0-5]\d$/,
    {
      message: `Date must be in ${BOOKING_DATE_FORMAT} format`,
    },
  )
  @Validate(DateValidation)
  date?: string;

  @AutoMap()
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  seats?: number;

  @AutoMap()
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  table?: string;

  @AutoMap()
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  deposit?: number;

  @AutoMap()
  @ApiProperty({ required: false, enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @AutoMap()
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class GetTableBookingQueryDto extends BaseQueryDto {
  @AutoMap()
  @ApiPropertyOptional({
    example: 'slug-123',
  })
  @IsOptional()
  @IsString()
  slug?: string;

  @AutoMap()
  @ApiPropertyOptional({
    example: 'john doe',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @AutoMap()
  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  phone?: string;

  @AutoMap()
  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  email?: string;

  @AutoMap()
  @ApiPropertyOptional({
    description: 'Filter bookings on a given day (dd/mm/yyyy)',
    example: '24/06/2026',
  })
  @IsOptional()
  @IsString()
  date?: string;

  @AutoMap()
  @ApiPropertyOptional({
    description: 'Filter bookings at a given time (HH:mm), requires date',
    example: '18:00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'Time must be in HH:mm format (24-hour, e.g., 18:30)',
  })
  time?: string;

  @AutoMap()
  @ApiPropertyOptional({
    description: 'Filter bookings from this day onward (dd/mm/yyyy)',
    example: '24/06/2026',
  })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @AutoMap()
  @ApiPropertyOptional({
    description: 'Filter bookings up to this day (dd/mm/yyyy)',
    example: '30/06/2026',
  })
  @IsOptional()
  @IsString()
  toDate?: string;

  @AutoMap()
  @ApiPropertyOptional({
    description: 'Filter bookings created on a given day (dd/mm/yyyy)',
    example: '24/06/2026',
  })
  @IsOptional()
  @IsString()
  createdDate?: string;

  @AutoMap()
  @ApiPropertyOptional({})
  @IsOptional()
  @IsNumber()
  seats?: number;

  @AutoMap()
  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  table?: string;

  @AutoMap()
  @ApiPropertyOptional({})
  @IsOptional()
  @IsNumber()
  deposit?: number;

  @AutoMap()
  @ApiPropertyOptional({
    description: 'Filter by the booking status',
    enum: BookingStatus,
    example: BookingStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional({
    description: 'Has paging or not',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return true;
    return value === 'true';
  })
  hasPaging?: boolean;
}
