import { AutoMap } from '@automapper/classes';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty } from 'class-validator';
import { BaseResponseDto } from 'src/app/base.dto';

export class ToggleAuditLogsConfigDto {
  @ApiProperty({ example: 'slug-1234' })
  @IsNotEmpty()
  slug: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  enabled: boolean;
}

export class AuditLogsConfigResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  entity: string;

  @AutoMap()
  @ApiProperty()
  enabled: boolean;
}
