import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { VoucherGroup } from 'src/voucher-group/voucher-group.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { CampaignRecipient } from './campaign-recipient.entity';
import { VoucherCampaignTemplate } from './voucher-campaign-template.entity';
import { CampaignStatus } from '../campaign.constants';

@Entity({ name: 'campaign_tbl' })
export class Campaign extends Base {
  @AutoMap()
  @Column({ name: 'name_column' })
  name: string;

  @AutoMap()
  @Column({ name: 'type_column' })
  type: string;

  @AutoMap()
  @Column({ name: 'status_column', default: CampaignStatus.SCHEDULED })
  status: string;

  @AutoMap()
  @Column({ name: 'recipient_limit_column', nullable: true })
  recipientLimit?: number;

  @AutoMap()
  @Column({ name: 'start_date_column' })
  startDate: Date;

  @AutoMap()
  @Column({ name: 'end_date_column', nullable: true })
  endDate?: Date;

  @ManyToOne(() => VoucherGroup, { nullable: false })
  @JoinColumn({ name: 'voucher_group_column' })
  voucherGroup: VoucherGroup;

  @OneToOne(() => VoucherCampaignTemplate, (template) => template.campaign, {
    nullable: true,
    cascade: ['insert', 'update'],
  })
  @JoinColumn({ name: 'voucher_campaign_template_column' })
  voucherCampaignTemplate?: VoucherCampaignTemplate;

  @OneToMany(() => CampaignRecipient, (recipient) => recipient.campaign)
  recipients: CampaignRecipient[];
}
