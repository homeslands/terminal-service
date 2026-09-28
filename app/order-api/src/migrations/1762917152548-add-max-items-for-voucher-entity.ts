import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMaxItemsForVoucherEntity1762917152548
  implements MigrationInterface
{
  name = 'AddMaxItemsForVoucherEntity1762917152548';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` ADD \`max_items_column\` int NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` DROP COLUMN \`max_items_column\``,
    );
  }
}
