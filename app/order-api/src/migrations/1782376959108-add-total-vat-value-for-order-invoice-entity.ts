import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTotalVatValueForOrderInvoiceEntity1782376959108
  implements MigrationInterface
{
  name = 'AddTotalVatValueForOrderInvoiceEntity1782376959108';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`order_tbl\` ADD \`total_vat_value_column\` decimal(15,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`invoice_tbl\` ADD \`total_vat_value_column\` decimal(15,2) NOT NULL DEFAULT '0'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`invoice_tbl\` DROP COLUMN \`total_vat_value_column\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`order_tbl\` DROP COLUMN \`total_vat_value_column\``,
    );
  }
}
