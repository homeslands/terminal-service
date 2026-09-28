import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { ChefOrderItem } from 'src/chef-order-item/chef-order-item.entity';
import { DiscountType } from 'src/order/order.constants';
import { Order } from 'src/order/order.entity';
import { Promotion } from 'src/promotion/promotion.entity';
import { TrackingOrderItem } from 'src/tracking-order-item/tracking-order-item.entity';
import { Variant } from 'src/variant/variant.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('order_item_tbl')
export class OrderItem extends Base {
  @AutoMap()
  @Column({ name: 'quantity_column' })
  quantity: number;

  @AutoMap()
  @Column({ name: 'original_subtotal_column', default: 0 })
  originalSubtotal: number;

  @AutoMap()
  @Column({ name: 'subtotal_column' })
  subtotal: number;

  @AutoMap()
  @Column({ name: 'subtotal_cost_column', default: 0 })
  subtotalCost: number;

  @AutoMap()
  @Column({ name: 'is_gift_column', default: false })
  isGift: boolean;

  @AutoMap()
  @Column({ name: 'custom_price_column', nullable: true })
  customPrice?: number;

  @AutoMap()
  @Column({ name: 'note_column', nullable: true })
  note?: string;

  // many to one with order
  @ManyToOne(() => Order, (order) => order.orderItems)
  @JoinColumn({ name: 'order_column' })
  order: Order;

  // many to one with variant
  @ManyToOne(() => Variant, (variant) => variant.orderItems)
  @JoinColumn({ name: 'variant_column' })
  variant: Variant;

  // one to many with tracking order item
  @OneToMany(
    () => TrackingOrderItem,
    (trackingOrderItem) => trackingOrderItem.orderItem,
  )
  trackingOrderItems: TrackingOrderItem[];

  @AutoMap()
  @Column({ name: 'discount_type_column', default: DiscountType.NONE })
  discountType: string;

  @AutoMap()
  @Column({ name: 'is_applied_promotion_column', default: false })
  isAppliedPromotion: boolean;

  @AutoMap()
  @Column({ name: 'is_applied_voucher_column', default: false })
  isAppliedVoucher: boolean;

  @AutoMap()
  @Column({ name: 'voucher_value_column', default: 0 })
  voucherValue: number;

  @AutoMap()
  @Column({
    name: 'vat_rate_column',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: { to: (v) => v, from: (v) => parseFloat(v) },
  })
  vatRate: number;

  @AutoMap()
  @Column({
    name: 'vat_value_column',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: { to: (v) => v, from: (v) => parseFloat(v) },
  })
  vatValue: number;

  @ManyToOne(() => Promotion, (promotion) => promotion.orderItems, {
    nullable: true,
  })
  @JoinColumn({ name: 'promotion_column' })
  promotion?: Promotion;

  @OneToMany(() => ChefOrderItem, (chefOrderItem) => chefOrderItem.orderItem)
  chefOrderItems: ChefOrderItem[];
}
