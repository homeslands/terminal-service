import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import moment from 'moment';
import { BaseQueryDto } from 'src/app/base.dto';
import { CardOrderStatus } from '../card-order.enum';
import { INVALID_CARD_ORDER_STATUS } from '../card-order.validation';
export class FindAllCardOrderDto extends BaseQueryDto {
  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  customerSlug?: string;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value) return moment(value, 'YYYY-MM-DD').endOf('day').toDate();
    return null;
  })
  fromDate: Date;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value) return moment(value, 'YYYY-MM-DD').endOf('day').toDate();
    return null;
  })
  toDate: Date;

  @IsOptional()
  @ApiProperty({ required: false })
  @IsEnum(CardOrderStatus, { message: INVALID_CARD_ORDER_STATUS })
  status: string;

  @IsOptional()
  @ApiProperty({ required: false })
  k: string;

  @IsOptional()
  @ApiProperty({ required: false })
  paymentMethod: string;
}
