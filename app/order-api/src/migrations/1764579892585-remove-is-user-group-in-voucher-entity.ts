import { VoucherCustomerType } from 'src/voucher/voucher.constant';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveIsUserGroupInVoucherEntity1764579892585
  implements MigrationInterface
{
  name = 'RemoveIsUserGroupInVoucherEntity1764579892585';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` DROP COLUMN \`is_user_group_column\``,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` ADD \`is_user_group_column\` tinyint NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `UPDATE voucher_tbl SET is_user_group_column = 1 WHERE customer_type_column = '${VoucherCustomerType.GROUP}'`,
    );
    await queryRunner.query(
      `UPDATE voucher_tbl SET is_user_group_column = 0 WHERE customer_type_column = '${VoucherCustomerType.ALL}'`,
    );
  }
}
