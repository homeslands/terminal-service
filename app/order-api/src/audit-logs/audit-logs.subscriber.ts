import {
  EntitySubscriberInterface,
  EventSubscriber,
  UpdateEvent,
  RemoveEvent,
  InsertEvent,
  SoftRemoveEvent,
} from 'typeorm';
import { Logger } from 'winston';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Inject } from '@nestjs/common';
import { AuditLogs } from './audit-logs.entity';
import { AuditLogsService } from './audit-logs.service';
import { AuditEvent, IgnoredFields } from './audit-logs.constant';
import { getRandomString } from 'src/helper';
import { ClsService } from 'nestjs-cls';
import { AuditLogsConfigService } from 'src/audit-logs/audit-logs-config/audit-logs-config.service';
@EventSubscriber()
export class AuditLogsSubscriber<T> implements EntitySubscriberInterface<T> {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    private readonly auditLogsService: AuditLogsService,
    private readonly clsService: ClsService,
    private readonly auditLogsConfigService: AuditLogsConfigService,
  ) {}

  readonly IgnoredList = Object.values(IgnoredFields) as string[];

  /*
    Recursively strip sensitive fields at ANY depth of an entity graph.
    Returns a fresh copy (never mutates the source entity/relations) and
    guards against circular relation references (TypeORM back-references).
  */
  private redact<V>(value: V, seen: WeakSet<object> = new WeakSet()): V {
    if (value === null || typeof value !== 'object') {
      return value;
    }
    // Leave non-plain value objects intact (don't turn them into {}).
    if (value instanceof Date || Buffer.isBuffer(value)) {
      return value;
    }
    // Break cycles in the relation graph.
    if (seen.has(value as object)) {
      return undefined as unknown as V;
    }
    seen.add(value as object);

    if (Array.isArray(value)) {
      return value.map((item) => this.redact(item, seen)) as unknown as V;
    }

    const out: Record<string, any> = {};
    for (const [key, val] of Object.entries(value as Record<string, any>)) {
      if (this.IgnoredList.includes(key)) {
        // drop sensitive field regardless of nesting depth
        continue;
      }
      out[key] = this.redact(val, seen);
    }
    return out as V;
  }

  private asignValue(
    event: AuditEvent,
    entity: string,
    from?: Record<string, any>,
    to?: Record<string, any>,
  ): AuditLogs {
    const auditLogs = new AuditLogs();
    auditLogs.createdAt = new Date();
    auditLogs.slug = getRandomString();
    auditLogs.user = this.clsService.get('user') ?? 'unknown';
    auditLogs.userSlug = this.clsService.get('userSlug') ?? 'unknown';
    auditLogs.entity = entity;
    auditLogs.event = event as AuditEvent;
    auditLogs.from = from;
    auditLogs.to = to;
    return auditLogs;
  }

  /*
    update event listener
  */
  async afterUpdate(event: UpdateEvent<T>): Promise<void> {
    const context = this.afterUpdate.name;
    try {
      const entitySlug = this.auditLogsConfigService.getWatchedEntitySlug(
        event.metadata.name,
      );
      if (!entitySlug) {
        return;
      }
      const { entity, databaseEntity, updatedColumns } = event;
      if (!updatedColumns) {
        this.logger.error(`Cannot get field has been changed`, context);
        return;
      }
      const fromRecord: Record<string, any> = {};
      const toRecord: Record<string, any> = {};
      for (const updatedColumn of updatedColumns) {
        const propeName: string = updatedColumn.propertyName;
        if (this.IgnoredList.includes(propeName)) {
          this.logger.log(`Skip watching ${propeName}`, context);
          continue;
        }
        const oldValue = databaseEntity[propeName] ?? null;
        let newValue = null;
        if (entity && propeName in entity) {
          newValue = entity[propeName];
        }
        // An updated column value can itself be a nested relation object,
        // so redact recursively before storing.
        fromRecord[propeName] = this.redact(oldValue);
        toRecord[propeName] = this.redact(newValue);
      }
      const from = JSON.stringify(fromRecord);
      const to = JSON.stringify(toRecord);
      if (from == to) {
        this.logger.error(`Values have not been changed properly`, context);
        return;
      }
      const auditLog = this.asignValue(
        AuditEvent.UPDATE,
        entitySlug,
        fromRecord,
        toRecord,
      );
      this.logger.log(
        `Entity ${auditLog.entity} from value ${from} to value ${to}`,
        context,
      );
      await this.auditLogsService.createAuditLog(auditLog, event.manager);
    } catch (error: any) {
      this.logger.error(`${error}`, context);
    }
  }
  /*
    delete event listener
  */
  async afterRemove(event: RemoveEvent<T>): Promise<void> {
    const context = this.afterRemove.name;
    try {
      const entitySlug = this.auditLogsConfigService.getWatchedEntitySlug(
        event.metadata.name,
      );
      if (!entitySlug) return;
      const oldValues = this.redact(event.databaseEntity ?? event.entity ?? {});
      const auditLog = this.asignValue(
        AuditEvent.DELETE,
        entitySlug,
        oldValues,
        null,
      );
      await this.auditLogsService.createAuditLog(auditLog, event.manager);
      this.logger.log(
        `Entity ${auditLog.entity} from value ${JSON.stringify(oldValues)}`,
        context,
      );
    } catch (error: any) {
      this.logger.error(`${error}`, context);
    }
  }
  /*
   soft delete event listener
  */
  async afterSoftRemove(event: SoftRemoveEvent<T>): Promise<void> {
    const context = this.afterSoftRemove.name;
    try {
      const entitySlug = this.auditLogsConfigService.getWatchedEntitySlug(
        event.metadata.name,
      );
      if (!entitySlug) return;
      const oldValues = this.redact(
        event.databaseEntity ??
          event.entity ??
          event.metadata.afterSoftRemoveListeners ??
          {},
      );
      const auditLog = this.asignValue(
        AuditEvent.DELETE,
        entitySlug,
        oldValues,
        {},
      );
      await this.auditLogsService.createAuditLog(auditLog, event.manager);
      this.logger.log(
        `Entity ${auditLog.entity} from value ${JSON.stringify(oldValues)}`,
        context,
      );
    } catch (error: any) {
      this.logger.error(`${error}`, context);
    }
  }
  /*
    create event listener
  */
  async afterInsert(event: InsertEvent<T>): Promise<void> {
    const context = this.afterInsert.name;
    try {
      const entitySlug = this.auditLogsConfigService.getWatchedEntitySlug(
        event.metadata.name,
      );
      if (!entitySlug) return;
      // redact() returns a fresh copy, so the live event.entity is not mutated.
      const newValues = this.redact(event.entity ?? {});
      const auditLog = this.asignValue(
        AuditEvent.CREATE,
        entitySlug,
        null,
        newValues,
      );
      await this.auditLogsService.createAuditLog(auditLog, event.manager);
      this.logger.log(
        `Entity ${auditLog.entity} to value ${JSON.stringify(newValues)}`,
        context,
      );
    } catch (error: any) {
      this.logger.error(`${error}`, context);
    }
  }
}
