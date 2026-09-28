import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterDurationVoucherCampaignTemplateToNullable1778225067448
  implements MigrationInterface
{
  name = 'AlterDurationVoucherCampaignTemplateToNullable1778225067448';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`voucher_campaign_template_tbl\` CHANGE \`duration_column\` \`duration_column\` int NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE \`voucher_campaign_template_tbl\` SET \`duration_column\` = 0 WHERE \`duration_column\` IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`voucher_campaign_template_tbl\` CHANGE \`duration_column\` \`duration_column\` int NOT NULL`,
    );
  }
}
