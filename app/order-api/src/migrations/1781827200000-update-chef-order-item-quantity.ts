import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateChefOrderItemQuantity1781827200000
  implements MigrationInterface
{
  name = 'UpdateChefOrderItemQuantity1781827200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`chef_order_item_tbl\` CHANGE COLUMN \`default_quantity_column\` \`quantity_column\` INT NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE \`chef_order_item_tbl\` SET \`quantity_column\` = 1 WHERE \`quantity_column\` != 1`,
    );
    await queryRunner.query(
      `ALTER TABLE \`chef_order_item_tbl\` CHANGE COLUMN \`quantity_column\` \`default_quantity_column\` ENUM('1') NOT NULL DEFAULT '1'`,
    );
  }
}
