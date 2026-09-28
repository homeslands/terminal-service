import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddActiveTimeWindowForVoucherEntity1778573104627
  implements MigrationInterface
{
  name = 'AddActiveTimeWindowForVoucherEntity1778573104627';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` ADD \`active_start_time_column\` varchar(5) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` ADD \`active_end_time_column\` varchar(5) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` DROP COLUMN \`active_end_time_column\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` DROP COLUMN \`active_start_time_column\``,
    );
  }
}
