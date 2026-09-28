import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRelationCampaignAndVoucherCampaignTemplate1778170528876
  implements MigrationInterface
{
  name = 'AddRelationCampaignAndVoucherCampaignTemplate1778170528876';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`campaign_tbl\` ADD \`voucher_campaign_template_column\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`REL_e1e1fbf07c881229cd0ca100f6\` ON \`campaign_tbl\` (\`voucher_campaign_template_column\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_tbl\` ADD CONSTRAINT \`FK_e1e1fbf07c881229cd0ca100f63\` FOREIGN KEY (\`voucher_campaign_template_column\`) REFERENCES \`voucher_campaign_template_tbl\`(\`id_column\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`campaign_tbl\` DROP FOREIGN KEY \`FK_e1e1fbf07c881229cd0ca100f63\``,
    );
    await queryRunner.query(
      `DROP INDEX \`REL_e1e1fbf07c881229cd0ca100f6\` ON \`campaign_tbl\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_tbl\` DROP COLUMN \`voucher_campaign_template_column\``,
    );
  }
}
