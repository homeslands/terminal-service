import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { VoucherType } from 'src/voucher/voucher.constant';
import { Column, Entity, OneToOne } from 'typeorm';
import { Campaign } from './campaign.entity';

@Entity('voucher_campaign_template_tbl')
export class VoucherCampaignTemplate extends Base {
  @AutoMap()
  @Column({ name: 'title_column' })
  title: string;

  @AutoMap()
  @Column({ name: 'description_column', nullable: true })
  description?: string;

  @AutoMap()
  @Column({ name: 'value_column' })
  value: number;

  @AutoMap()
  @Column({ name: 'type_column', default: VoucherType.PERCENT_ORDER })
  type: string;

  @AutoMap()
  @Column({ name: 'max_usage_column' })
  maxUsage: number;

  @AutoMap()
  @Column({ name: 'min_order_value_column', default: 0 })
  minOrderValue: number;

  @AutoMap()
  @Column({ name: 'applicability_rule_column' })
  applicabilityRule: string;

  @AutoMap()
  @Column({ name: 'duration_column', nullable: true })
  duration: number;

  @AutoMap()
  @Column({ name: 'usage_frequency_unit_column' })
  usageFrequencyUnit: string;

  @AutoMap()
  @Column({ name: 'usage_frequency_value_column', nullable: true })
  usageFrequencyValue?: number;

  @AutoMap()
  @Column({ name: 'max_items_column', nullable: true })
  maxItems?: number;

  @Column({ name: 'payment_methods_column', type: 'json', nullable: true })
  paymentMethods?: string[];

  @Column({ name: 'product_slugs_column', type: 'json', nullable: true })
  productSlugs?: string[];

  @OneToOne(() => Campaign, (campaign) => campaign.voucherCampaignTemplate)
  campaign: Campaign;
}
