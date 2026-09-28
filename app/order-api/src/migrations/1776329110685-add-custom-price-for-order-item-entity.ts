import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomPriceForOrderItemEntity1776329110685
  implements MigrationInterface
{
  name = 'AddCustomPriceForOrderItemEntity1776329110685';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`order_item_tbl\` ADD \`custom_price_column\` int NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`order_item_tbl\` DROP COLUMN \`custom_price_column\``,
    );
  }
}
