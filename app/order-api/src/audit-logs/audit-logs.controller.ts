import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditLogsService } from './audit-logs.service';
import { HasRoles } from 'src/role/roles.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { AuditLogResponseDto, GetAuditLogQueryDto } from './audit-logs.dto';

@Controller('audit-logs')
@ApiTags('Audit Logs')
@ApiBearerAuth()
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @HasRoles(RoleEnum.SuperAdmin, RoleEnum.Admin)
  @ApiOperation({ summary: 'Get all audit logs' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'The audit logs have been retrieved successfully',
    type: AuditLogResponseDto,
    isArray: true,
  })
  async getAll(
    @Query(new ValidationPipe({ transform: true }))
    query: GetAuditLogQueryDto,
  ) {
    const result = await this.auditLogsService.getAll(query);
    return {
      message: 'The audit logs have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    };
  }
}
