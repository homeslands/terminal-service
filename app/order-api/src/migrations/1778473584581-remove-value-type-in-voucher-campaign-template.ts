import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveValueTypeInVoucherCampaignTemplate1778473584581
  implements MigrationInterface
{
  name = 'RemoveValueTypeInVoucherCampaignTemplate1778473584581';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`voucher_campaign_template_tbl\` DROP COLUMN \`value_type_column\``,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`voucher_campaign_template_tbl\` ADD \`value_type_column\` varchar(255) NOT NULL DEFAULT 'percentage'`,
    );
  }
}
