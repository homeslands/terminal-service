import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueConstraintCampaignRecipientForCampaignUserYear1778171066264
  implements MigrationInterface
{
  name = 'AddUniqueConstraintCampaignRecipientForCampaignUserYear1778171066264';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`UQ_campaign_recipient\` ON \`campaign_recipient_tbl\` (\`campaign_column\`, \`user_column\`, \`year_column\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`UQ_campaign_recipient\` ON \`campaign_recipient_tbl\``,
    );
  }
}
