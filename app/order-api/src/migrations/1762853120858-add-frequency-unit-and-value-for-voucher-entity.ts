import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFrequencyUnitAndValueForVoucherEntity1762853120858
  implements MigrationInterface
{
  name = 'AddFrequencyUnitAndValueForVoucherEntity1762853120858';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` ADD \`usage_frequency_unit_column\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` ADD \`usage_frequency_value_column\` int NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` DROP COLUMN \`usage_frequency_value_column\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` DROP COLUMN \`usage_frequency_unit_column\``,
    );
  }
}
