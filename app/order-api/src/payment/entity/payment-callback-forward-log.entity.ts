import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Column, Entity } from 'typeorm';

@Entity('payment_callback_forward_log_tbl')
export class PaymentCallbackForwardLog extends Base {
  @AutoMap()
  @Column({ name: 'route_code_column', nullable: true })
  routeCode?: string;

  @AutoMap()
  @Column({ name: 'target_url_column', nullable: true })
  targetUrl?: string;

  @AutoMap()
  @Column({ name: 'trace_number_column', nullable: true })
  traceNumber?: string;

  @AutoMap()
  @Column({ name: 'transaction_status_column', nullable: true })
  transactionStatus?: string;

  @AutoMap()
  @Column({ name: 'transaction_channel_column', nullable: true })
  transactionChannel?: string;

  @AutoMap()
  @Column({ name: 'transaction_date_column', nullable: true })
  transactionDate?: string;

  @AutoMap()
  @Column({ name: 'effective_date_column', nullable: true })
  effectiveDate?: string;

  @AutoMap()
  @Column({ name: 'debit_or_credit_column', nullable: true })
  debitOrCredit?: string;

  @AutoMap()
  @Column({ name: 'amount_column', type: 'decimal', nullable: true })
  amount?: number;

  @AutoMap()
  @Column({ name: 'transaction_content_column', type: 'text', nullable: true })
  transactionContent?: string;

  @AutoMap()
  @Column({ name: 'beneficiary_name_column', nullable: true })
  beneficiaryName?: string;

  @AutoMap()
  @Column({ name: 'virtual_account_column', nullable: true })
  virtualAccount?: string;

  @AutoMap()
  @Column({ name: 'raw_payload_column', type: 'text', nullable: true })
  rawPayload?: string;
}
