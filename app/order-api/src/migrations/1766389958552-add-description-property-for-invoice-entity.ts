import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDescriptionPropertyForInvoiceEntity1766389958552
  implements MigrationInterface
{
  name = 'AddDescriptionPropertyForInvoiceEntity1766389958552';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`invoice_tbl\` ADD \`description_column\` varchar(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`invoice_tbl\` DROP COLUMN \`description_column\``,
    );
  }
}
