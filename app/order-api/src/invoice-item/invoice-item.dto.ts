import { AutoMap } from '@automapper/classes';
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { BaseResponseDto } from 'src/app/base.dto';
import { RoleEnum } from 'src/role/role.enum';

export class InvoiceItemResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  productName: string;

  @AutoMap()
  @ApiProperty()
  quantity: number;

  @AutoMap()
  @ApiProperty()
  price: number;

  @AutoMap()
  @ApiProperty()
  total: number;

  @AutoMap()
  @ApiProperty()
  promotionValue: number;

  @AutoMap()
  @ApiProperty()
  size: string;

  @AutoMap()
  @ApiProperty()
  discountType: string;

  @AutoMap()
  @ApiProperty()
  isAppliedPromotion: boolean;

  @AutoMap()
  @ApiProperty()
  isAppliedVoucher: boolean;

  @AutoMap()
  @ApiProperty()
  voucherValue: number;

  @AutoMap()
  @Expose({ groups: [RoleEnum.SuperAdmin, RoleEnum.Admin, RoleEnum.Manager] })
  @ApiProperty()
  totalCost: number;

  @AutoMap()
  @ApiProperty()
  vatRate: number;

  @AutoMap()
  @ApiProperty()
  vatValue: number;
}
