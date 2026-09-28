import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { AuditEvent } from './audit-logs.constant';
@Entity('audit_logs_tbl')
export class AuditLogs {
  @PrimaryGeneratedColumn('uuid', { name: 'id_column' })
  id: string;

  @AutoMap()
  @Column({ name: 'slug_column', unique: true })
  slug: string;

  @AutoMap()
  @CreateDateColumn({ type: 'timestamp', name: 'created_at_column' })
  createdAt: Date;

  @AutoMap()
  @Column({ name: 'user_slug_column', nullable: false })
  userSlug: string;

  @AutoMap()
  @Column({ name: 'user_column', nullable: false })
  user: string;

  @AutoMap()
  @Column({ name: 'event_column', nullable: false })
  event: AuditEvent;

  @AutoMap()
  @Column({ name: 'entity_column', nullable: false })
  entity: string;

  @AutoMap()
  @Column({ name: 'from_column', type: 'json', nullable: true })
  from?: Record<string, any>;

  @AutoMap()
  @Column({ name: 'to_column', type: 'json', nullable: true })
  to?: Record<string, any>;
}
