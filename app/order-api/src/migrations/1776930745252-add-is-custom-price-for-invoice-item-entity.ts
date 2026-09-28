import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsCustomPriceForInvoiceItemEntity1776930745252
  implements MigrationInterface
{
  name = 'AddIsCustomPriceForInvoiceItemEntity1776930745252';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`invoice_item_tbl\` ADD \`is_custom_price_column\` tinyint NOT NULL DEFAULT '0'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`invoice_item_tbl\` DROP COLUMN \`is_custom_price_column\``,
    );
  }
}
