import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Column, Entity } from 'typeorm';
import { PaymentCallbackServiceType } from '../payment.constants';

@Entity('payment_callback_route_tbl')
export class PaymentCallbackRoute extends Base {
  @AutoMap()
  @Column({ name: 'code_column', unique: true })
  code: string;

  @AutoMap()
  @Column({
    name: 'service_type_column',
    default: PaymentCallbackServiceType.INTERNAL,
  })
  serviceType: string;

  @AutoMap()
  @Column({ name: 'target_url_column', nullable: true })
  targetUrl?: string;

  @AutoMap()
  @Column({ name: 'target_api_key_column', nullable: true })
  targetApiKey?: string;

  @AutoMap()
  @Column({ name: 'timeout_ms_column', type: 'int', default: 15000 })
  timeoutMs: number;

  @AutoMap()
  @Column({ name: 'is_active_column', default: true })
  isActive: boolean;

  @AutoMap()
  @Column({ name: 'description_column', nullable: true })
  description?: string;
}
