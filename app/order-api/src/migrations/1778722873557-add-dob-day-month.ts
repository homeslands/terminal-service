import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDobDayMonth1778722873557 implements MigrationInterface {
  name = 'AddDobDayMonth1778722873557';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`user_tbl\` ADD \`dob_day_month\` varchar(255) NULL`,
    );
    await queryRunner.query(`UPDATE user_tbl
            SET dob_day_month = CONCAT(SUBSTRING(dob_column, 1, 2), SUBSTRING(dob_column, 4, 2))
            WHERE dob_column IS NOT NULL AND dob_column LIKE '__/__/____'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`user_tbl\` DROP COLUMN \`dob_day_month\``,
    );
  }
}
