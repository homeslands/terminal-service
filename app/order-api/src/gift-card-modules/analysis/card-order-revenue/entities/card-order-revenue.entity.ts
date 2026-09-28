import { AutoMap } from "@automapper/classes";
import { Base } from "src/app/base.entity";
import { Column, Entity } from "typeorm";

@Entity('card_order_revenue_tbl')
export class CardOrderRevenue extends Base {
    @AutoMap(() => Date)
    @Column({ type: 'timestamp', name: 'date_column', unique: true })
    date: Date;

    @AutoMap()
    @Column({ name: 'total_card_orders_column' })
    totalCardOrders: number;

    @AutoMap()
    @Column({ name: 'total_card_orders_by_bank_column' })
    totalCardOrdersByBank: number;

    @AutoMap()
    @Column({ name: 'total_card_orders_by_cash_column' })
    totalCardOrdersByCash: number;

    @AutoMap()
    @Column({ name: 'min_order_sequence_column' })
    minOrderSequence: number;

    @AutoMap()
    @Column({ name: 'max_order_sequence_column' })
    maxOrderSequence: number;

    @AutoMap()
    @Column({ name: 'total_revenue_column', type: 'decimal', precision: 10, scale: 2 })
    totalRevenue: number;

    @AutoMap()
    @Column({ name: 'bank_revenue_column', type: 'decimal', precision: 10, scale: 2 })
    bankRevenue: number;

    @AutoMap()
    @Column({ name: 'cash_revenue_column', type: 'decimal', precision: 10, scale: 2 })
    cashRevenue: number;

    @AutoMap()
    @Column({ name: 'card_count_column' })
    cardCount: number;

    @AutoMap()
    @Column({ name: 'self_topup_order_count_column' })
    selfTopupOrderCount: number;

    @AutoMap()
    @Column({ name: 'gift_topup_order_count_column' })
    giftTopupOrderCount: number;

    @AutoMap()
    @Column({ name: 'card_purchase_order_count_column' })
    cardPurchaseOrderCount: number;
}
