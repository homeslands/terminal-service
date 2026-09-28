import { AutoMap } from '@automapper/classes';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from 'src/app/base.dto';
import { AuditEvent } from './audit-logs.constant';

export class GetAuditLogQueryDto extends BaseQueryDto {
  @AutoMap()
  @ApiPropertyOptional({
    description: 'Filter by the slug of user who performed the action',
    example: 'john doe',
  })
  @IsOptional()
  @IsString()
  user?: string;

  @AutoMap()
  @ApiPropertyOptional({
    description: 'Filter by the affected entity name',
    example: 'Order',
  })
  @IsOptional()
  @IsString()
  entity?: string;

  @AutoMap()
  @ApiPropertyOptional({
    description: 'Filter by the affected entity slug',
    example: 'Order',
  })
  @IsOptional()
  @IsString()
  slug?: string;

  @AutoMap()
  @ApiPropertyOptional({
    description: 'Filter by the audited event',
    enum: AuditEvent,
    example: AuditEvent.UPDATE,
  })
  @IsOptional()
  @IsEnum(AuditEvent)
  event?: AuditEvent;

  @AutoMap()
  @ApiPropertyOptional({
    description: 'Filter audit logs created from this date (inclusive)',
    example: 'yyyy-mm-dd',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @AutoMap()
  @ApiPropertyOptional({
    description: 'Filter audit logs created up to this date (inclusive)',
    example: 'yyyy-mm-dd',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Has paging or not',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return true; // Default true
    return value === 'true'; // Transform 'true' to `true` and others to `false`
  })
  hasPaging?: boolean;
}

export class AuditLogResponseDto {
  @AutoMap()
  @ApiProperty()
  slug: string;

  @AutoMap()
  @ApiProperty()
  createdAt: string;

  @AutoMap()
  @ApiProperty()
  userSlug: string;

  @AutoMap()
  @ApiProperty()
  user: string;

  @AutoMap()
  @ApiProperty({ enum: AuditEvent })
  event: AuditEvent;

  @AutoMap()
  @ApiProperty()
  entity: string;

  @AutoMap()
  @ApiPropertyOptional({ type: Object })
  from?: Record<string, any>;

  @AutoMap()
  @ApiPropertyOptional({ type: Object })
  to?: Record<string, any>;
}
