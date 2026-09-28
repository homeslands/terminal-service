import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVatRateToProductSchemaMigration1780900000000
  implements MigrationInterface
{
  name = 'AddVatRateToProductSchemaMigration1780900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`product_tbl\` ADD \`vat_rate_column\` decimal(5,2) NOT NULL DEFAULT '0.00'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`product_tbl\` DROP COLUMN \`vat_rate_column\``,
    );
  }
}
