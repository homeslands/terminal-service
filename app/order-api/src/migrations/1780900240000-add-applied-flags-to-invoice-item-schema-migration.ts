import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAppliedFlagsToInvoiceItemSchemaMigration1780900240000
  implements MigrationInterface
{
  name = 'AddAppliedFlagsToInvoiceItemSchemaMigration1780900240000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`invoice_item_tbl\` ADD \`is_applied_promotion_column\` tinyint NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE \`invoice_item_tbl\` ADD \`is_applied_voucher_column\` tinyint NOT NULL DEFAULT 0`,
    );
    // Backfill from existing discountType data
    await queryRunner.query(
      `UPDATE \`invoice_item_tbl\` SET \`is_applied_promotion_column\` = 1 WHERE \`discount_type_column\` = 'promotion'`,
    );
    await queryRunner.query(
      `UPDATE \`invoice_item_tbl\` SET \`is_applied_voucher_column\` = 1 WHERE \`discount_type_column\` = 'voucher'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`invoice_item_tbl\` DROP COLUMN \`is_applied_voucher_column\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`invoice_item_tbl\` DROP COLUMN \`is_applied_promotion_column\``,
    );
  }
}
