import { CardOrderRevenue } from 'src/gift-card-modules/analysis/card-order-revenue/entities/card-order-revenue.entity';
import { getRandomString } from 'src/helper';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

interface IRevenueQueryResult {
  total_card_orders_column: number;
  total_revenue_column: number;
  bank_revenue_column: number;
  cash_revenue_column: number;
  card_count_column: number;
  self_topup_order_count_column: number;
  gift_topup_order_count_column: number;
  card_purchase_order_count_column: number;
  date_column: string;
  total_card_orders_by_bank_column: number;
  total_card_orders_by_cash_column: number;
  min_order_sequence_column: number;
  max_order_sequence_column: number;
}

export class AddCardOrderRevenueSchemaMigration1765560999987
  implements MigrationInterface
{
  name = 'AddCardOrderRevenueSchemaMigration1765560999987';
  private readonly REVENUE_TABLE_NAME = 'card_order_revenue_tbl';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const createFuncQuery = `
            CREATE FUNCTION GEN_RANDOM_STRING()
            RETURNS VARCHAR(10)
            DETERMINISTIC
            BEGIN
                RETURN SUBSTRING(REPLACE(UUID(), '-', ''), 1, 10);
            END
        `;
    const dropTriggerQuery = `DROP TRIGGER IF EXISTS trg_card_order_status_to_completed_after_update`;
    const createTrgiggerQuery = `   
        CREATE TRIGGER trg_card_order_status_to_completed_after_update
        AFTER UPDATE ON card_order_tbl
        FOR EACH ROW
        BEGIN
            IF OLD.status_column != 'completed' AND NEW.status_column = 'completed' THEN
                INSERT INTO card_order_revenue_tbl (
                    id_column,
                    slug_column,
                    date_column,
                    total_card_orders_column,
                    total_revenue_column,
                    bank_revenue_column,
                    cash_revenue_column,
                    card_count_column,
                    self_topup_order_count_column,
                    gift_topup_order_count_column,
                    card_purchase_order_count_column,
                    total_card_orders_by_bank_column,
                    total_card_orders_by_cash_column,
                    min_order_sequence_column,
                    max_order_sequence_column
                ) VALUES (
                    UUID(),
                    GEN_RANDOM_STRING(),
                    DATE(NOW()),
                    1,
                    COALESCE(NEW.total_amount_column, 0),
                    CASE WHEN NEW.payment_method_column = 'bank-transfer'
                        THEN COALESCE(NEW.total_amount_column, 0)
                    ELSE 0
                    END,
                    CASE WHEN NEW.payment_method_column = 'cash'
                        THEN COALESCE(NEW.total_amount_column, 0)
                    ELSE 0
                    END,
                    CASE WHEN NEW.type_column = 'BUY'
                        THEN COALESCE(NEW.quantity_column, 0)
                    ELSE 0
                    END,
                    CASE WHEN NEW.type_column = 'SELF' THEN 1 ELSE 0 END,
                    CASE WHEN NEW.type_column = 'GIFT' THEN 1 ELSE 0 END,
                    CASE WHEN NEW.type_column = 'BUY'  THEN 1 ELSE 0 END,
                    CASE WHEN NEW.payment_method_column = 'bank-transfer' THEN 1 ELSE 0 END,
                    CASE WHEN NEW.payment_method_column = 'cash' THEN 1 ELSE 0 END,
                    NEW.sequence_column,
                    NEW.sequence_column
                )
                ON DUPLICATE KEY UPDATE
                    total_card_orders_column = total_card_orders_column + 1,
                    total_revenue_column = total_revenue_column + VALUES(total_revenue_column),
                    bank_revenue_column  = bank_revenue_column + VALUES(bank_revenue_column),
                    cash_revenue_column  = cash_revenue_column + VALUES(cash_revenue_column),
                    card_count_column    = card_count_column + VALUES(card_count_column),
                    self_topup_order_count_column = self_topup_order_count_column + VALUES(self_topup_order_count_column),
                    gift_topup_order_count_column = gift_topup_order_count_column + VALUES(gift_topup_order_count_column),
                    card_purchase_order_count_column = card_purchase_order_count_column + VALUES(card_purchase_order_count_column),
                    total_card_orders_by_bank_column = total_card_orders_by_bank_column + VALUES(total_card_orders_by_bank_column),
                    total_card_orders_by_cash_column = total_card_orders_by_cash_column + VALUES(total_card_orders_by_cash_column),
                    min_order_sequence_column = LEAST(min_order_sequence_column, VALUES(min_order_sequence_column)),
                    max_order_sequence_column = GREATEST(max_order_sequence_column, VALUES(max_order_sequence_column));
                END IF;
        END;    
        `;
    const caclRevenueQuery = `
            SELECT
                DATE(created_at_column) AS date_column,

                COUNT(*) AS total_card_orders_column,

                MIN(sequence_column) AS min_order_sequence_column,
    
                MAX(sequence_column) AS max_order_sequence_column,
                
                COALESCE(
                    SUM((payment_method_column = 'bank-transfer')),
                    0
                ) AS total_card_orders_by_bank_column,
                
                COALESCE(
                    SUM((payment_method_column = 'cash')),
                    0
                ) AS total_card_orders_by_cash_column,

                COALESCE(SUM(total_amount_column), 0) AS total_revenue_column,

                COALESCE(
                    SUM(total_amount_column * (payment_method_column = 'bank-transfer')),
                    0
                ) AS bank_revenue_column,

                COALESCE(
                    SUM(total_amount_column * (payment_method_column = 'cash')),
                    0
                ) AS cash_revenue_column,

                COALESCE(
                    SUM(quantity_column * (type_column = 'BUY')),
                    0
                ) AS card_count_column,

                SUM(type_column = 'SELF') AS self_topup_order_count_column,
                SUM(type_column = 'GIFT') AS gift_topup_order_count_column,
                SUM(type_column = 'BUY')  AS card_purchase_order_count_column
            FROM card_order_tbl
            WHERE status_column = 'completed'
            GROUP BY date_column
            ORDER BY date_column ASC
        `;
    const insertCardOrderRevenueQuery = `
            INSERT INTO ${this.REVENUE_TABLE_NAME} 
                (
                    id_column, 
                    slug_column, 
                    date_column, 
                    total_card_orders_column, 
                    total_revenue_column, 
                    bank_revenue_column, 
                    cash_revenue_column, 
                    card_count_column, 
                    self_topup_order_count_column, 
                    gift_topup_order_count_column, 
                    card_purchase_order_count_column,
                    total_card_orders_by_bank_column,
                    total_card_orders_by_cash_column,
                    min_order_sequence_column,
                    max_order_sequence_column
                )
            VALUES ?
        `;
    const revenueData: IRevenueQueryResult[] =
      (await queryRunner.query(caclRevenueQuery)) || [];
    const cardOrderRevenues = revenueData.map((item) =>
      this.buildCardOrderRenenueItem(item),
    );
    const values = cardOrderRevenues.map((cor) => [
      cor.id,
      cor.slug,
      cor.date,
      cor.totalCardOrders,
      cor.totalRevenue,
      cor.bankRevenue,
      cor.cashRevenue,
      cor.cardCount,
      cor.selfTopupOrderCount,
      cor.giftTopupOrderCount,
      cor.cardPurchaseOrderCount,
      cor.totalCardOrdersByBank,
      cor.totalCardOrdersByCash,
      cor.minOrderSequence,
      cor.maxOrderSequence,
    ]);
    await queryRunner.query(createFuncQuery);
    await queryRunner.query(dropTriggerQuery);
    await queryRunner.query(createTrgiggerQuery);
    await queryRunner.query(
      `CREATE TABLE \`${this.REVENUE_TABLE_NAME}\` (\`id_column\` varchar(36) NOT NULL, \`total_card_orders_by_bank_column\` int NOT NULL, \`total_card_orders_by_cash_column\` int NOT NULL, \`min_order_sequence_column\` int NOT NULL, \`max_order_sequence_column\` int NOT NULL, \`slug_column\` varchar(255) NOT NULL, \`created_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at_column\` datetime(6) NULL, \`created_by_column\` varchar(255) NULL, \`date_column\` timestamp NOT NULL, \`total_card_orders_column\` int NOT NULL, \`total_revenue_column\` decimal(10,2) NOT NULL, \`bank_revenue_column\` decimal(10,2) NOT NULL, \`cash_revenue_column\` decimal(10,2) NOT NULL, \`card_count_column\` int NOT NULL, \`self_topup_order_count_column\` int NOT NULL, \`gift_topup_order_count_column\` int NOT NULL, \`card_purchase_order_count_column\` int NOT NULL, UNIQUE INDEX \`IDX_4a992264bb05df8e238dd41f7d\` (\`slug_column\`), PRIMARY KEY (\`id_column\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`${this.REVENUE_TABLE_NAME}\` ADD UNIQUE INDEX \`IDX_6f2dc55ab66a6c63498898c856\` (\`date_column\`)`,
    );
    if (values.length > 0) {
      await queryRunner.query(insertCardOrderRevenueQuery, [values]);
    }
  }

  private buildCardOrderRenenueItem(revenue: IRevenueQueryResult) {
    const id = uuidv4();
    const slug = getRandomString();
    const cor = new CardOrderRevenue();
    Object.assign(cor, {
      id,
      slug,
      date: new Date(revenue.date_column),
      bankRevenue: revenue.bank_revenue_column,
      cashRevenue: revenue.cash_revenue_column,
      cardCount: revenue.card_count_column,
      cardPurchaseOrderCount: revenue.card_purchase_order_count_column,
      giftTopupOrderCount: revenue.gift_topup_order_count_column,
      selfTopupOrderCount: revenue.self_topup_order_count_column,
      totalCardOrders: revenue.total_card_orders_column,
      totalRevenue: revenue.total_revenue_column,
      totalCardOrdersByBank: revenue.total_card_orders_by_bank_column,
      totalCardOrdersByCash: revenue.total_card_orders_by_cash_column,
      minOrderSequence: revenue.min_order_sequence_column,
      maxOrderSequence: revenue.max_order_sequence_column,
    } as Partial<CardOrderRevenue>);
    return cor;
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dropFuncQuery = `
            DROP FUNCTION IF EXISTS GEN_RANDOM_STRING
        `;
    const dropTriggerQuery = `DROP TRIGGER IF EXISTS trg_card_order_status_to_completed_after_update`;
    await queryRunner.query(dropFuncQuery);
    await queryRunner.query(dropTriggerQuery);
    await queryRunner.query(
      `ALTER TABLE \`${this.REVENUE_TABLE_NAME}\` DROP INDEX \`IDX_6f2dc55ab66a6c63498898c856\``,
    );
    await queryRunner.query(`DROP TABLE \`${this.REVENUE_TABLE_NAME}\``);
  }
}
