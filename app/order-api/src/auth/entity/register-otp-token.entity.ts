import { Entity, Column, Index } from 'typeorm';
import { Base } from 'src/app/base.entity';
import { AutoMap } from '@automapper/classes';

@Entity('register_otp_token_tbl')
export class RegisterOtpToken extends Base {
  @Index()
  @Column({ name: 'phonenumber_column' })
  phonenumber: string;

  @Column({ name: 'token_column' })
  token: string;

  @AutoMap()
  @Column({ name: 'expires_at_column' })
  expiresAt: Date;

  @Column({ name: 'last_sent_at_column', type: 'timestamp', nullable: true })
  lastSentAt: Date;

  @Column({ name: 'attempt_count_column', default: 0 })
  attemptCount: number;

  @Column({ name: 'is_used_column', default: false })
  isUsed: boolean;
}
