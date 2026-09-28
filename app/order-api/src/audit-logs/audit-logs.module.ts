import { DynamicModule, Module } from '@nestjs/common';
import { AuditLogsSubscriber } from './audit-logs.subscriber';
import { DataSource } from 'typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogs } from './audit-logs.entity';
import { Logger } from 'winston';
import { AuditLogsService } from './audit-logs.service';
import { ClsService } from 'nestjs-cls';
import { AuditLogsConfigModule } from './audit-logs-config/audit-logs-config.module';
import { AuditLogsConfigService } from './audit-logs-config/audit-logs-config.service';
import { AuditLogsController } from './audit-logs.controller';
@Module({})
export class AuditLogsModule {
  static forRoot(): DynamicModule {
    const subscriberProvider = {
      provide: 'AUDIT_SUBSCRIBER',
      inject: [
        DataSource,
        WINSTON_MODULE_NEST_PROVIDER,
        AuditLogsService,
        ClsService,
        AuditLogsConfigService,
      ],
      useFactory: (
        dataSource: DataSource,
        logger: Logger,
        auditLogsService: AuditLogsService,
        clsService: ClsService,
        auditLogsConfigService: AuditLogsConfigService,
      ) => {
        const subscriber = new AuditLogsSubscriber(
          logger,
          auditLogsService,
          clsService,
          auditLogsConfigService,
        );
        dataSource.subscribers.push(subscriber);
        return subscriber;
      },
    };

    return {
      module: AuditLogsModule,
      imports: [TypeOrmModule.forFeature([AuditLogs]), AuditLogsConfigModule],
      controllers: [AuditLogsController],
      providers: [subscriberProvider, AuditLogsService],
      exports: [subscriberProvider],
    };
  }
}
