import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVatFieldsToInvoiceItemSchemaMigration1780900120000
  implements MigrationInterface
{
  name = 'AddVatFieldsToInvoiceItemSchemaMigration1780900120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`invoice_item_tbl\` ADD \`vat_rate_column\` decimal(5,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`invoice_item_tbl\` ADD \`vat_value_column\` decimal(15,2) NOT NULL DEFAULT '0.00'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`invoice_item_tbl\` DROP COLUMN \`vat_value_column\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`invoice_item_tbl\` DROP COLUMN \`vat_rate_column\``,
    );
  }
}
