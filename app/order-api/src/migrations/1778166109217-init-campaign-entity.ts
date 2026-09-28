import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitCampaignEntity1778166109217 implements MigrationInterface {
  name = 'InitCampaignEntity1778166109217';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`campaign_tbl\` (\`id_column\` varchar(36) NOT NULL, \`slug_column\` varchar(255) NOT NULL, \`created_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at_column\` datetime(6) NULL, \`created_by_column\` varchar(255) NULL, \`name_column\` varchar(255) NOT NULL, \`type_column\` varchar(255) NOT NULL, \`status_column\` varchar(255) NOT NULL DEFAULT 'scheduled', \`recipient_limit_column\` int NULL, \`start_date_column\` datetime NOT NULL, \`end_date_column\` datetime NULL, UNIQUE INDEX \`IDX_892dae0370d48a523870790923\` (\`slug_column\`), PRIMARY KEY (\`id_column\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`campaign_tbl\``);
  }
}
