import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitPrinterEventEntity1765334465991 implements MigrationInterface {
  name = 'InitPrinterEventEntity1765334465991';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`printer_event_tbl\` (\`id_column\` varchar(36) NOT NULL, \`slug_column\` varchar(255) NOT NULL, \`created_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at_column\` datetime(6) NULL, \`created_by_column\` varchar(255) NULL, \`title_column\` varchar(255) NOT NULL, \`body_column\` varchar(255) NOT NULL, \`message_column\` varchar(255) NOT NULL, \`link_column\` varchar(255) NULL, \`type_column\` varchar(255) NOT NULL, \`retry_status_column\` varchar(255) NOT NULL, \`retry_time_column\` int NOT NULL DEFAULT '0', \`receiver_id_column\` varchar(255) NOT NULL, \`receiver_name_column\` varchar(255) NULL, \`metadata_column\` json NULL, UNIQUE INDEX \`IDX_4b3c5fcf6e78e469e11d593f0a\` (\`slug_column\`), PRIMARY KEY (\`id_column\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_4b3c5fcf6e78e469e11d593f0a\` ON \`printer_event_tbl\``,
    );
    await queryRunner.query(`DROP TABLE \`printer_event_tbl\``);
  }
}
