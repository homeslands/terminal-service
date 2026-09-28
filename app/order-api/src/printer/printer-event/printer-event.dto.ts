import { AutoMap } from '@automapper/classes';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional } from 'class-validator';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';
import { PrinterEventRetryStatus } from './printer-event.constants';
import { PrinterJobResponseDto } from '../printer.dto';
import { Type } from 'class-transformer';

export class CreatePrinterEventDto {
  @AutoMap()
  @ApiProperty({})
  @IsOptional()
  title?: string;

  @AutoMap()
  @ApiProperty({})
  @IsOptional()
  body?: string;

  @AutoMap()
  @ApiProperty({})
  @IsNotEmpty()
  message: string;

  @AutoMap()
  @ApiProperty({})
  @IsNotEmpty()
  receiverId: string;

  @AutoMap()
  @ApiProperty({})
  @IsOptional()
  receiverName?: string;

  @AutoMap()
  @ApiProperty({})
  @IsNotEmpty()
  type: string;

  @AutoMap()
  @ApiProperty({})
  @IsOptional()
  metadata?: Record<string, any>;

  @AutoMap()
  @ApiProperty({})
  @IsOptional()
  link?: string;

  // is save to database or not
  @AutoMap()
  @ApiProperty({})
  @IsOptional()
  existedPrinterEvent?: string | null;

  @AutoMap()
  @ApiProperty({})
  @IsOptional()
  printerJobId?: string;
}

export class PrinterEventResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty({})
  title: string;

  @AutoMap()
  @ApiProperty({})
  body: string;

  @AutoMap()
  @ApiProperty({})
  message: string;

  @AutoMap()
  @ApiProperty({})
  type: string;

  @AutoMap()
  @ApiProperty({})
  retryStatus: string;

  @AutoMap()
  @ApiProperty({})
  retryTime: number;

  @AutoMap()
  @ApiProperty({})
  receiverId: string;

  @AutoMap()
  @ApiProperty({})
  receiverName: string;

  @AutoMap()
  @ApiProperty({})
  metadata: string;

  @AutoMap()
  @ApiProperty({})
  link: string;

  @AutoMap(() => PrinterJobResponseDto)
  printerJob: PrinterJobResponseDto;
}

export class GetPrinterEventsRequestDto extends BaseQueryDto {
  @AutoMap()
  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(PrinterEventRetryStatus, {
    message:
      'Invalid retry status must be one of the following: success, failed',
  })
  retryStatus?: string;

  @AutoMap()
  @ApiProperty({ required: false })
  @IsOptional()
  type?: string;

  @AutoMap()
  @ApiProperty({ required: false })
  @IsOptional()
  receiver?: string;

  @AutoMap()
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Date)
  startDate?: Date;

  @AutoMap()
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Date)
  endDate?: Date;
}
