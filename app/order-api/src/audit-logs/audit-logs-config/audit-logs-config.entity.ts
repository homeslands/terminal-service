import { Entity, Column, Unique } from 'typeorm';
import { Base } from 'src/app/base.entity';
import { AutoMap } from '@automapper/classes';

@Entity('audit_logs_config_tbl')
@Unique(['entity'])
export class AuditLogsConfig extends Base {
  @AutoMap()
  @Column({ name: 'entity_column' })
  entity: string; // matches event.metadata.name, e.g. "User"

  @AutoMap()
  @Column({ name: 'enabled_column', default: true })
  enabled: boolean;
}
