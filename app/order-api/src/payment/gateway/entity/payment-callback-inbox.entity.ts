import { Base } from 'src/app/base.entity';
import { Column, Entity } from 'typeorm';
import { PaymentCallbackInboxStatus } from '../../payment.constants';

/**
 * Idempotency + audit store for raw ACB callbacks, written synchronously
 * before any routing decision. `traceNumber` is unique so a bank retry of
 * the same transaction never gets processed twice.
 */
@Entity('payment_callback_inbox_tbl')
export class PaymentCallbackInbox extends Base {
  @Column({ name: 'trace_number_column', unique: true })
  traceNumber: string;

  @Column({ name: 'route_code_column', nullable: true })
  routeCode?: string;

  @Column({
    name: 'status_column',
    default: PaymentCallbackInboxStatus.RECEIVED,
  })
  status: string;

  @Column({ name: 'raw_payload_column', type: 'text' })
  rawPayload: string;

  @Column({ name: 'retry_count_column', type: 'int', default: 0 })
  retryCount: number;

  @Column({ name: 'last_error_column', type: 'text', nullable: true })
  lastError?: string;
}
