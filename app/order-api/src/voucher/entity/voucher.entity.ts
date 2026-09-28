import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Order } from 'src/order/order.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { VoucherType, VoucherValueType } from '../voucher.constant';
import { VoucherGroup } from 'src/voucher-group/voucher-group.entity';
import { VoucherProduct } from 'src/voucher-product/voucher-product.entity';
import { VoucherPaymentMethod } from './voucher-payment-method.entity';
import { VoucherUserGroup } from 'src/voucher-user-group/voucher-user-group.entity';
import { User } from 'src/user/user.entity';

@Entity('voucher_tbl')
export class Voucher extends Base {
  @AutoMap()
  @Column({ name: 'code_column', unique: true })
  code: string;

  @AutoMap()
  @Column({ name: 'title_column' })
  title: string;

  @AutoMap()
  @Column({ name: 'description_column', nullable: true })
  description?: string;

  @AutoMap()
  @Column({ name: 'max_usage_column' })
  maxUsage: number;

  @AutoMap()
  @Column({ name: 'remaining_usage_column' })
  remainingUsage: number;

  @AutoMap()
  @Column({ name: 'value_type_column', default: VoucherValueType.PERCENTAGE })
  valueType: string;

  @AutoMap()
  @Column({ name: 'min_order_value_column', default: 0 })
  minOrderValue: number;

  @AutoMap()
  @Column({ name: 'start_date_column' })
  startDate: Date;

  @AutoMap()
  @Column({ name: 'end_date_column' })
  endDate: Date;

  @AutoMap()
  @Column({ name: 'value_column' })
  value: number;

  @AutoMap()
  @Column({ name: 'is_active_column', default: false })
  isActive: boolean;

  @OneToMany(() => Order, (order) => order.voucher)
  orders: Order[];

  @AutoMap()
  @Column({ name: 'is_verification_identity_column', default: true })
  isVerificationIdentity: boolean;

  // display or not for all user
  @AutoMap()
  @Column({ name: 'is_private_column', default: false })
  isPrivate: boolean;

  // if all_required, all product in order must be valid
  // => calculate base on subtotal order
  // if at_least_one_required, only one product in order must be valid
  // => calculate base on subtotal order item
  @AutoMap()
  @Column({
    name: 'applicability_rule_column',
  })
  applicabilityRule: string;

  @AutoMap()
  @Column({ name: 'type_column', default: VoucherType.PERCENT_ORDER })
  type: string;

  @AutoMap()
  @Column({ name: 'number_of_usage_per_user_column', default: 1 })
  numberOfUsagePerUser: number;

  @ManyToOne(() => VoucherGroup, (voucherGroup) => voucherGroup.vouchers)
  @JoinColumn({ name: 'voucher_group_column' })
  voucherGroup?: VoucherGroup;

  @OneToMany(() => VoucherProduct, (voucherProduct) => voucherProduct.voucher)
  voucherProducts: VoucherProduct[];

  @OneToMany(
    () => VoucherPaymentMethod,
    (voucherPaymentMethod) => voucherPaymentMethod.voucher,
    {
      cascade: ['insert', 'update', 'remove'],
    },
  )
  voucherPaymentMethods: VoucherPaymentMethod[];

  // if customerType is group, only user in user group can use voucher
  // if customerType is all, all user can use voucher
  // if customerType is group, isVerificationIdentity must be true
  // if isVerificationIdentity is false, customerType must be all
  // if isVerificationIdentity is true, customerType can be group or all
  // customerType is person same as group
  @AutoMap()
  @Column({ name: 'customer_type_column' })
  customerType: string;

  @OneToMany(
    () => VoucherUserGroup,
    (voucherUserGroup) => voucherUserGroup.voucher,
  )
  voucherUserGroups: VoucherUserGroup[];

  @AutoMap()
  @ManyToOne(() => User, (user) => user.individualVouchers, { nullable: true })
  @JoinColumn({ name: 'assigned_user_column' })
  assignedUser?: User;

  // frequency used for voucher
  @AutoMap()
  @Column({ name: 'usage_frequency_unit_column' })
  usageFrequencyUnit: string; // hour, day, week, month, year

  @AutoMap()
  @Column({ name: 'usage_frequency_value_column', nullable: true })
  usageFrequencyValue: number;

  // maximum items can be used for voucher per order, null is unlimited
  @AutoMap()
  @Column({ name: 'max_items_column', nullable: true })
  maxItems: number;

  // active time window within a day, null means all day
  @AutoMap()
  @Column({ name: 'active_start_time_column', nullable: true })
  activeStartTime?: string; // HH:MM

  @AutoMap()
  @Column({ name: 'active_end_time_column', nullable: true })
  activeEndTime?: string; // HH:MM
}
