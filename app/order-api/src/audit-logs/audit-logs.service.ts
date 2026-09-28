import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Inject, Logger, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuditLogs } from './audit-logs.entity';
import {
  Between,
  EntityManager,
  FindManyOptions,
  FindOptionsWhere,
  Like,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import moment from 'moment';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { AuditLogResponseDto, GetAuditLogQueryDto } from './audit-logs.dto';
import { AuditLogsConfigService } from './audit-logs-config/audit-logs-config.service';
@Injectable()
export class AuditLogsService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    @InjectRepository(AuditLogs)
    private readonly repository: Repository<AuditLogs>,
    private readonly auditLogsConfigService: AuditLogsConfigService,
  ) {}

  async createAuditLog(
    auditLog: AuditLogs,
    manager: EntityManager,
  ): Promise<void> {
    const context = this.createAuditLog.name;
    // Let failures propagate to the caller (the subscriber) so they are not
    // silently lost here. The subscriber decides how to handle/log them.
    const saved = await manager.save(auditLog);
    this.logger.log(`Save successfully audit log ${saved.id}`, context);
  }

  async getAll(
    query: GetAuditLogQueryDto,
  ): Promise<AppPaginatedResponseDto<AuditLogResponseDto>> {
    // Construct where options
    const whereOptions: FindOptionsWhere<AuditLogs> = {};
    if (query.user) whereOptions.userSlug = query.user;
    // query.entity = this.auditLogsConfigService.getWatchedEntitySlug(
    //   query.entity,
    // );
    if (query.entity)
      whereOptions.entity = Like(
        `%${this.auditLogsConfigService.getWatchedEntitySlug(query.entity)}%`,
      );
    if (query.slug) whereOptions.entity = query.slug;
    if (query.event) whereOptions.event = query.event;

    // Filter by created date range (inclusive)
    const startDate = query.startDate
      ? moment(query.startDate).startOf('day').toDate()
      : undefined;
    const endDate = query.endDate
      ? moment(query.endDate).endOf('day').toDate()
      : undefined;
    if (startDate && endDate) {
      whereOptions.createdAt = Between(startDate, endDate);
    } else if (startDate) {
      whereOptions.createdAt = MoreThanOrEqual(startDate);
    } else if (endDate) {
      whereOptions.createdAt = LessThanOrEqual(endDate);
    }

    // Construct find many options
    const findManyOptions: FindManyOptions<AuditLogs> = {
      where: whereOptions,
      order: { createdAt: 'DESC' },
    };

    if (query.hasPaging) {
      findManyOptions.skip = (query.page - 1) * query.size;
      findManyOptions.take = query.size;
    }

    // Exec query
    const [auditLogs, total] =
      await this.repository.findAndCount(findManyOptions);

    // Calculate paging metadata
    const page = query.hasPaging ? query.page : 1;
    const pageSize = query.hasPaging ? query.size : total;
    const totalPages = Math.ceil(total / pageSize);
    const hasNext = page < totalPages;
    const hasPrevious = page > 1;

    const items: AuditLogResponseDto[] = auditLogs.map((log) => ({
      slug: log.slug,
      createdAt: log.createdAt?.toISOString(),
      userSlug: log.userSlug,
      user: log.user,
      event: log.event,
      entity: log.entity,
      from: log.from,
      to: log.to,
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
      hasNext,
      hasPrevios: hasPrevious,
    } as AppPaginatedResponseDto<AuditLogResponseDto>;
  }
}
