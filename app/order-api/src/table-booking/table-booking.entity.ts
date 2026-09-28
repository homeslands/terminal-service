import { Entity, Column } from 'typeorm';
import { Base } from 'src/app/base.entity';
import { AutoMap } from '@automapper/classes';
import { BookingStatus } from './table-booking.constants';

@Entity('table_booking_tbl')
export class TableBookingEntity extends Base {
  @AutoMap()
  @Column({ name: 'name_column', nullable: false })
  name: string;

  @AutoMap()
  @Column({ name: 'phone_column', nullable: false })
  phone: string;

  @AutoMap()
  @Column({ name: 'email_column', nullable: true })
  email!: string | null;

  @AutoMap()
  @Column({ name: 'date_column', type: 'timestamp', nullable: false })
  date: Date;

  @AutoMap()
  @Column({ name: 'seats_column', nullable: true })
  seats!: number | null;

  @AutoMap()
  @Column({ name: 'table_column', nullable: true })
  table!: string | null;

  @AutoMap()
  @Column({ name: 'deposit_column', nullable: true })
  deposit!: number | null;

  @AutoMap()
  @Column({
    name: 'status_column',
    default: BookingStatus.PENDING,
    nullable: false,
  })
  status: BookingStatus;

  @AutoMap()
  @Column({ name: 'note_column', nullable: true })
  note!: string | null;
}
