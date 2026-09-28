import { VoucherUsageFrequencyUnit } from 'src/voucher/voucher.constant';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class ModifyUsageFrequencyValueForVoucherEntity1763977530451
  implements MigrationInterface
{
  name = 'ModifyUsageFrequencyValueForVoucherEntity1763977530451';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` CHANGE \`usage_frequency_value_column\` \`usage_frequency_value_column\` int NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // set usage frequency value to max int value if it is null to avoid error when down migration
    await queryRunner.query(
      `UPDATE \`voucher_tbl\` SET \`usage_frequency_value_column\` = 2147483647 WHERE \`usage_frequency_value_column\` IS NULL`,
    );
    await queryRunner.query(
      `UPDATE \`voucher_tbl\` SET \`usage_frequency_unit_column\` = 'hour' WHERE \`usage_frequency_unit_column\` = '${VoucherUsageFrequencyUnit.UNLIMITED}'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` CHANGE \`usage_frequency_value_column\` \`usage_frequency_value_column\` int NOT NULL`,
    );
  }
}
