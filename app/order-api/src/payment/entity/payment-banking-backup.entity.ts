import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Column, Entity } from 'typeorm';

@Entity('payment_banking_backup_tbl')
export class PaymentBankingBackup extends Base {
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
  @Column({ name: 'beneficiary_account_number_column', nullable: true })
  beneficiaryAccountNumber?: string;

  @AutoMap()
  @Column({ name: 'receiver_bank_name_column', nullable: true })
  receiverBankName?: string;

  @AutoMap()
  @Column({ name: 'virtual_account_column', nullable: true })
  virtualAccount?: string;

  @AutoMap()
  @Column({ name: 'reference_number_column', nullable: true })
  referenceNumber?: string;

  @AutoMap()
  @Column({ name: 'partner_customer_code_column', nullable: true })
  partnerCustomerCode?: string;

  @AutoMap()
  @Column({ name: 'partner_customer_name_column', nullable: true })
  partnerCustomerName?: string;

  @AutoMap()
  @Column({ name: 'partner_customer_type_column', nullable: true })
  partnerCustomerType?: string;

  @AutoMap()
  @Column({ name: 'payment_id_column', nullable: true })
  paymentId?: string;

  @AutoMap()
  @Column({ name: 'raw_payload_column', type: 'text', nullable: true })
  rawPayload?: string;
}
