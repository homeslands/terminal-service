import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Branch } from 'src/branch/branch.entity';
import { Invoice } from 'src/invoice/invoice.entity';
import { Order } from 'src/order/order.entity';
import { User } from 'src/user/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { WorkShiftStatus } from './work-shift.constants';

@Entity('work_shift_tbl')
export class WorkShift extends Base {
  @ManyToOne(() => User)
  @JoinColumn({ name: 'cashier_column' })
  cashier: User;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branch_column' })
  branch: Branch;

  @AutoMap()
  @Column({ name: 'actual_start_time_column', type: 'timestamp' })
  actualStartTime: Date;

  @AutoMap()
  @Column({ name: 'actual_end_time_column', type: 'timestamp', nullable: true })
  actualEndTime: Date | null;

  @AutoMap()
  @Column({
    name: 'status_column',
    type: 'enum',
    enum: WorkShiftStatus,
    default: WorkShiftStatus.ACTIVE,
  })
  status: WorkShiftStatus;

  @AutoMap()
  @Column({
    name: 'opening_cash_column',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  openingCash: number;

  @AutoMap()
  @Column({
    name: 'closing_cash_column',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  closingCash: number | null;

  @AutoMap()
  @Column({ name: 'note_column', nullable: true, type: 'text' })
  note: string | null;

  @OneToMany(() => Order, (o) => o.workShift)
  orders: Order[];

  @OneToMany(() => Invoice, (i) => i.workShift)
  invoices: Invoice[];
}
