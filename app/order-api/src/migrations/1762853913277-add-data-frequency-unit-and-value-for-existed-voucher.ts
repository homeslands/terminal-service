import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDataFrequencyUnitAndValueForExistedVoucher1762853913277
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        UPDATE voucher_tbl
        SET usage_frequency_unit_column = 'hour', usage_frequency_value_column = 1
        WHERE (usage_frequency_unit_column IS NULL OR usage_frequency_value_column IS NULL)
          AND TIMESTAMPDIFF(HOUR, start_date_column, end_date_column) <= 24
      `);

    await queryRunner.query(`
        UPDATE voucher_tbl
        SET usage_frequency_unit_column = 'day', usage_frequency_value_column = 1
        WHERE (usage_frequency_unit_column IS NULL OR usage_frequency_value_column IS NULL)
          AND TIMESTAMPDIFF(HOUR, start_date_column, end_date_column) > 24
      `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE voucher_tbl SET usage_frequency_unit_column = NULL WHERE usage_frequency_unit_column IS NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE voucher_tbl SET usage_frequency_value_column = NULL WHERE usage_frequency_value_column IS NOT NULL`,
    );
  }
}
