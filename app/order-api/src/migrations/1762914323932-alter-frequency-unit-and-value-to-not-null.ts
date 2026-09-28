import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterFrequencyUnitAndValueToNotNull1762914323932
  implements MigrationInterface
{
  name = 'AlterFrequencyUnitAndValueToNotNull1762914323932';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` CHANGE \`usage_frequency_unit_column\` \`usage_frequency_unit_column\` varchar(255) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` CHANGE \`usage_frequency_value_column\` \`usage_frequency_value_column\` int NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` CHANGE \`usage_frequency_value_column\` \`usage_frequency_value_column\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` CHANGE \`usage_frequency_unit_column\` \`usage_frequency_unit_column\` varchar(255) NULL`,
    );
  }
}
