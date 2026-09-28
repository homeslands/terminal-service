import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAppliedFlagsToOrderItemSchemaMigration1780900180000
  implements MigrationInterface
{
  name = 'AddAppliedFlagsToOrderItemSchemaMigration1780900180000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`order_item_tbl\` ADD \`is_applied_promotion_column\` tinyint NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE \`order_item_tbl\` ADD \`is_applied_voucher_column\` tinyint NOT NULL DEFAULT 0`,
    );
    // Backfill from existing discountType data
    await queryRunner.query(
      `UPDATE \`order_item_tbl\` SET \`is_applied_promotion_column\` = 1 WHERE \`discount_type_column\` = 'promotion'`,
    );
    await queryRunner.query(
      `UPDATE \`order_item_tbl\` SET \`is_applied_voucher_column\` = 1 WHERE \`discount_type_column\` = 'voucher'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`order_item_tbl\` DROP COLUMN \`is_applied_voucher_column\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`order_item_tbl\` DROP COLUMN \`is_applied_promotion_column\``,
    );
  }
}
