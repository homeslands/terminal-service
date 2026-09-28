import { Base } from 'src/app/base.entity';
import { User } from 'src/user/user.entity';
import { Voucher } from 'src/voucher/entity/voucher.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  Unique,
} from 'typeorm';
import { Campaign } from './campaign.entity';

@Entity({ name: 'campaign_recipient_tbl' })
@Unique('UQ_campaign_recipient', ['campaign', 'user', 'year'])
export class CampaignRecipient extends Base {
  @ManyToOne(() => Campaign, (campaign) => campaign.recipients)
  @JoinColumn({ name: 'campaign_column' })
  campaign: Campaign;

  @ManyToOne(() => User, (user) => user.campaignRecipients)
  @JoinColumn({ name: 'user_column' })
  user: User;

  @OneToOne(() => Voucher, { nullable: true })
  @JoinColumn({ name: 'voucher_column' })
  voucher?: Voucher;

  @Column({ name: 'received_at_column', type: 'timestamp' })
  receivedAt: Date;

  @Column({ name: 'year_column', nullable: true, type: 'int' })
  year?: number;
  // null  = one-time campaign (NEW_USER)
  // number = yearly campaign (USER_BIRTHDAY), e.g. 2026
}
