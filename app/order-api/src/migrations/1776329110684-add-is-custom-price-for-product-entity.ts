import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsCustomPriceForProductEntity1776329110684
  implements MigrationInterface
{
  name = 'AddIsCustomPriceForProductEntity1776329110684';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`product_tbl\` ADD \`is_custom_price_column\` tinyint NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`product_tbl\` DROP COLUMN \`is_custom_price_column\``,
    );
  }
}
