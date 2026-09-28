import { AutoMap } from '@automapper/classes';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsDate,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { BaseResponseDto } from 'src/app/base.dto';
import {
  MEMBERSHIP_CARD_CODE_REQUIRED,
  USER_SLUG_REQUIRED,
} from './membership-card.validation';
import { Type } from 'class-transformer';

export class CreateMembershipCardDto {
  @AutoMap()
  @ApiProperty()
  @IsNotEmpty({
    message: USER_SLUG_REQUIRED,
  })
  @IsString()
  user: string;

  @AutoMap()
  @ApiProperty()
  @IsNotEmpty({
    message: MEMBERSHIP_CARD_CODE_REQUIRED,
  })
  @IsString()
  code: string;

  @AutoMap()
  @ApiProperty()
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  expiredAt?: Date;
}

export class MembershipCardResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  isActive: boolean;

  @AutoMap()
  @ApiProperty()
  expiredAt?: string;
}

export class ReplaceMembershipCardDto {
  @AutoMap()
  @ApiProperty()
  @IsNotEmpty({
    message: MEMBERSHIP_CARD_CODE_REQUIRED,
  })
  @IsString()
  code: string;

  @AutoMap()
  @ApiProperty()
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  expiredAt?: Date;

  @AutoMap()
  @ApiProperty()
  @IsNotEmpty({
    message: USER_SLUG_REQUIRED,
  })
  @IsString()
  user: string;
}

export class BulkCreateMembershipCardDto {
  @AutoMap()
  @ApiProperty()
  @IsNotEmpty({
    message: 'The array of membership card codes is not empty',
  })
  @IsArray()
  @ArrayNotEmpty({
    message: 'The array of membership card codes is not empty',
  })
  @IsString({
    each: true,
    message: 'Each membership card code must be a string',
  })
  @Type(() => String)
  codes: string[];

  @AutoMap()
  @ApiProperty()
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  expiredAt?: Date;

  @AutoMap()
  @ApiProperty()
  @IsOptional()
  @IsString()
  userGroup?: string;
}
