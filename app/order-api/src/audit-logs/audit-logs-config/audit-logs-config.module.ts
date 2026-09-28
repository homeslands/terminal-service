import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogsConfig } from './audit-logs-config.entity';
import { AuditLogsConfigService } from './audit-logs-config.service';
import { AuditLogsConfigController } from './audit-logs-config.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLogsConfig])],
  controllers: [AuditLogsConfigController],
  providers: [AuditLogsConfigService],
  exports: [AuditLogsConfigService],
})
export class AuditLogsConfigModule {}
