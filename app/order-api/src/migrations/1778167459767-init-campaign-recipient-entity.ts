import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitCampaignRecipientEntity1778167459767
  implements MigrationInterface
{
  name = 'InitCampaignRecipientEntity1778167459767';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`campaign_recipient_tbl\` (\`id_column\` varchar(36) NOT NULL, \`slug_column\` varchar(255) NOT NULL, \`created_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at_column\` datetime(6) NULL, \`created_by_column\` varchar(255) NULL, \`received_at_column\` timestamp NOT NULL, \`year_column\` int NULL, UNIQUE INDEX \`IDX_3bea61d54715693e7ccd711dac\` (\`slug_column\`), PRIMARY KEY (\`id_column\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_3bea61d54715693e7ccd711dac\` ON \`campaign_recipient_tbl\``,
    );
    await queryRunner.query(`DROP TABLE \`campaign_recipient_tbl\``);
  }
}
