import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditLogs1780561638386 implements MigrationInterface {
  name = 'AddAuditLogs1780561638386';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`audit_logs_tbl\` (\`id_column\` varchar(36) NOT NULL, \`slug_column\` varchar(255) NOT NULL, \`created_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`user_column\` varchar(255) NOT NULL,  \`event_column\` varchar(255) NOT NULL,\`entity_column\` varchar(255) NOT NULL,  \`from_column\` json NULL, \`to_column\` json NULL,  PRIMARY KEY (\`id_column\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`audit_logs_config_tbl\` (\`id_column\` varchar(36) NOT NULL, \`slug_column\` varchar(255) NOT NULL, \`created_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at_column\` timestamp(6) NULL, \`created_by_column\` varchar(255) NULL, \`entity_column\` varchar(255) NOT NULL, \`enabled_column\` tinyint NOT NULL DEFAULT 1,  PRIMARY KEY (\`id_column\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`audit_logs_config_tbl\``);
    await queryRunner.query(`DROP TABLE \`audit_logs_tbl\``);
  }
}
