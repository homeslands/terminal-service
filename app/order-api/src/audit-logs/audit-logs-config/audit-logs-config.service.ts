import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AuditLogsConfig } from './audit-logs-config.entity';
import { IgnoreEntites } from './audit-logs-config.constants';
import { getRandomString } from 'src/helper';

@Injectable()
export class AuditLogsConfigService implements OnModuleInit {
  // entity name -> { slug, enabled }. Source of truth is the table; this is the hot-path cache.
  private cache = new Map<string, { slug: string; enabled: boolean }>();

  private readonly skip = Object.values(IgnoreEntites) as string[];

  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    @InjectRepository(AuditLogsConfig)
    private readonly repository: Repository<AuditLogsConfig>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
    await this.seedCatalog();
  }

  private async seedCatalog(): Promise<void> {
    const existing = await this.repository.find();
    const known = new Set(existing.map((c) => c.entity));
    const missing = this.dataSource.entityMetadatas
      .map((metadata) => metadata.name)
      .filter((name) => !this.skip.includes(name) && !known.has(name));
    if (missing.length === 0) return;

    const rows = missing.map((entity) =>
      this.repository.create({
        entity,
        slug: getRandomString(),
        enabled: false,
      }),
    );
    await this.repository.save(rows);
  }
  isEntityWatched(entity: string): boolean {
    if (this.skip.includes(entity)) return false;
    return this.cache.get(entity)?.enabled ?? false;
  }

  getWatchedEntitySlug(entity: string): string | undefined {
    if (this.skip.includes(entity)) return undefined;
    const config = this.cache.get(entity);
    return config?.enabled ? config.slug : undefined;
  }

  async findAll(): Promise<AuditLogsConfig[]> {
    return this.repository.find();
  }

  async setEntityWatched(
    slug: string,
    enabled: boolean,
  ): Promise<AuditLogsConfig> {
    const context = this.setEntityWatched.name;
    const config = await this.repository.findOne({ where: { slug } });
    if (!config) {
      this.logger.error(`Cannot find audit logs config ${slug}`, context);
      return;
    }
    config.enabled = enabled;
    const saved = await this.repository.save(config);
    await this.refresh();
    this.logger.log(`Audit watch for "${slug}" set to ${enabled}`, context);
    return saved;
  }

  private async refresh(): Promise<void> {
    const context = this.refresh.name;
    const configs = await this.repository.find();
    this.cache = new Map(
      configs.map((config) => [
        config.entity,
        { slug: config.slug, enabled: config.enabled },
      ]),
    );
    this.logger.log(
      `Audit config cache refreshed: ${configs.length} entries`,
      context,
    );
  }
}
