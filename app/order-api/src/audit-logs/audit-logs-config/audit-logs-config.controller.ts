import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppResponseDto } from 'src/app/app.dto';
import { AuditLogsConfigService } from './audit-logs-config.service';
import { ToggleAuditLogsConfigDto } from './audit-logs-config.dto';
import { AuditLogsConfig } from './audit-logs-config.entity';
import { HasRoles } from 'src/role/roles.decorator';
import { RoleEnum } from 'src/role/role.enum';
@Controller('audit-logs-config')
@ApiTags('Audit Logs Config')
@ApiBearerAuth()
export class AuditLogsConfigController {
  constructor(private readonly service: AuditLogsConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Get all audit watch configs' })
  @HttpCode(HttpStatus.OK)
  @HasRoles(RoleEnum.Manager, RoleEnum.Admin, RoleEnum.SuperAdmin)
  async findAll(): Promise<AppResponseDto<AuditLogsConfig[]>> {
    const result = await this.service.findAll();
    return {
      message: 'The audit watch configs retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AuditLogsConfig[]>;
  }

  @Patch()
  @ApiOperation({ summary: 'Enable or disable auditing for an entity' })
  @HttpCode(HttpStatus.OK)
  @HasRoles(RoleEnum.Manager, RoleEnum.Admin, RoleEnum.SuperAdmin)
  async toggle(
    @Body(ValidationPipe) dto: ToggleAuditLogsConfigDto,
  ): Promise<AppResponseDto<AuditLogsConfig>> {
    const result = await this.service.setEntityWatched(dto.slug, dto.enabled);
    return {
      message: 'The audit watch config updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AuditLogsConfig>;
  }
}
