import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserslugInAuditLogs1781319195913 implements MigrationInterface {
  name = 'AddUserslugInAuditLogs1781319195913';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`audit_logs_tbl\` ADD \`user_slug_column\` varchar(255) NOT NULL DEFAULT ''`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`audit_logs_tbl\` DROP COLUMN \`user_slug_column\``,
    );
  }
}
