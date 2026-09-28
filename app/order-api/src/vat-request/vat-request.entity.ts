import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Invoice } from 'src/invoice/invoice.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('vat_request_tbl')
export class VatRequest extends Base {
  @AutoMap()
  @Column({ name: 'customer_name_column' })
  customerName: string;

  @AutoMap()
  @Column({ name: 'tax_code_column', length: 20 })
  taxCode: string;

  @AutoMap()
  @Column({ name: 'address_column', type: 'text' })
  address: string;

  @AutoMap()
  @Column({ name: 'email_column' })
  email: string;

  @AutoMap()
  @Column({ name: 'company_name_column', nullable: true })
  companyName?: string;

  @AutoMap()
  @Column({ name: 'note_column', nullable: true, type: 'text' })
  note?: string;

  @AutoMap()
  @Column({ name: 'status_column', default: 'PENDING', length: 20 })
  status: string;

  @AutoMap()
  @Column({ name: 'invoice_number_column', nullable: true, length: 50 })
  invoiceNumber?: string;

  @AutoMap()
  @Column({ name: 'accountant_note_column', nullable: true, type: 'text' })
  accountantNote?: string;

  @Column({ name: 'invoice_id_column', unique: true })
  invoiceId: string;

  @ManyToOne(() => Invoice)
  @JoinColumn({ name: 'invoice_id_column' })
  invoice: Invoice;
}
