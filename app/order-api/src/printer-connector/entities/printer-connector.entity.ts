import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Branch } from 'src/branch/branch.entity';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';

@Entity('printer_connector_tbl')
export class PrinterConnectorConfig extends Base {
  @AutoMap()
  @Column({ name: 'url_column' })
  url: string;

  @AutoMap()
  @Column({ name: 'api_key_column' })
  apiKey: string;

  @OneToOne(() => Branch, (branch) => branch.printerConnectorConfig)
  @JoinColumn({ name: 'branch_column' })
  @AutoMap(() => Branch)
  branch: Branch;
}
