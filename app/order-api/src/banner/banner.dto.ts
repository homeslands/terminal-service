import { AutoMap } from '@automapper/classes';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional } from 'class-validator';
import { BaseResponseDto } from 'src/app/base.dto';
import { BannerPage } from './banner.constants';

export class CreateBannerRequestDto {
  @AutoMap()
  @ApiProperty({
    description: 'The title of banner',
    example: 'Banner',
    required: true,
  })
  @IsNotEmpty({ message: 'Title of banner is required' })
  title: string;

  @AutoMap()
  @ApiProperty({
    description: 'The content of banner',
    example: 'Banner content',
    required: true,
  })
  @IsNotEmpty({ message: 'Content of banner is required' })
  content: string;

  @AutoMap()
  @ApiProperty()
  @IsOptional()
  url: string;

  @AutoMap()
  @ApiProperty()
  @IsOptional()
  @Type(() => Boolean)
  useButtonUrl: boolean;

  @AutoMap()
  @ApiProperty()
  @IsNotEmpty({ message: 'Page of banner is required' })
  @IsEnum(BannerPage, { message: 'Page of banner is invalid' })
  page: string;
}

export class UpdateBannerRequestDto extends CreateBannerRequestDto {
  @AutoMap()
  @ApiProperty({
    description: 'The is active of banner',
    example: true,
    required: true,
  })
  @IsNotEmpty({ message: 'The is active of banner is required' })
  @Type(() => Boolean)
  isActive: boolean;
}

export class GetBannerQueryDto {
  @AutoMap()
  @ApiProperty({
    description: 'The activate banner',
    required: false,
    example: false,
  })
  // @Type(() => Boolean)
  @Transform(({ value }) => {
    return value === 'true' || value === true; // Transform 'true' to `true` and others to `false`
  })
  isActive?: boolean;

  @AutoMap()
  @ApiProperty({
    description: 'The page of banner',
    required: false,
    example: 'home',
  })
  @IsOptional()
  @IsEnum(BannerPage, { message: 'Page of banner is invalid' })
  page?: string;
}

export class BannerResponseDto extends BaseResponseDto {
  @AutoMap()
  title: string;

  @AutoMap()
  content: string;

  @AutoMap()
  image: string;

  @AutoMap()
  isActive: string;

  @AutoMap()
  url: string;

  @AutoMap()
  useButtonUrl: string;

  @AutoMap()
  page: string;
}
