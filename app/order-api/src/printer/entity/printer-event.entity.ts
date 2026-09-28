import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { PrinterJob } from './printer-job.entity';

@Entity('printer_event_tbl')
export class PrinterEvent extends Base {
  @AutoMap()
  @Column({ name: 'title_column' })
  title: string;

  @AutoMap()
  @Column({ name: 'body_column' })
  body: string;

  // The message code to display in the UI
  @AutoMap()
  @Column({ name: 'message_column' })
  message: string;

  @AutoMap()
  @Column({ name: 'link_column', nullable: true })
  link?: string;

  @AutoMap()
  @Column({ name: 'type_column' })
  type: string;

  @AutoMap()
  @Column({ name: 'retry_status_column' })
  retryStatus: string;

  @AutoMap()
  @Column({ name: 'retry_time_column', default: 0 })
  retryTime: number;

  @AutoMap()
  @Column({ name: 'receiver_id_column', nullable: false })
  receiverId: string;

  @AutoMap()
  @Column({ name: 'receiver_name_column', nullable: true })
  receiverName: string;

  // depend on type (order, invoice, chef order, etc.)
  @AutoMap()
  @Column({ name: 'metadata_column', type: 'json', nullable: true })
  metadata: string;

  @ManyToOne(() => PrinterJob, (printerJob) => printerJob.printerEvents)
  @JoinColumn({ name: 'printer_job_column' })
  @AutoMap(() => PrinterJob)
  printerJob: PrinterJob;
}
