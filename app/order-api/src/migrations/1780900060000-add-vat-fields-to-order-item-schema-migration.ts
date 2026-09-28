import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVatFieldsToOrderItemSchemaMigration1780900060000
  implements MigrationInterface
{
  name = 'AddVatFieldsToOrderItemSchemaMigration1780900060000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`order_item_tbl\` ADD \`vat_rate_column\` decimal(5,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`order_item_tbl\` ADD \`vat_value_column\` decimal(15,2) NOT NULL DEFAULT '0.00'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`order_item_tbl\` DROP COLUMN \`vat_value_column\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`order_item_tbl\` DROP COLUMN \`vat_rate_column\``,
    );
  }
}
