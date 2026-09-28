import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitVoucherCampaignTemplateEntity1778170199610
  implements MigrationInterface
{
  name = 'InitVoucherCampaignTemplateEntity1778170199610';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`voucher_campaign_template_tbl\` (\`id_column\` varchar(36) NOT NULL, \`slug_column\` varchar(255) NOT NULL, \`created_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at_column\` datetime(6) NULL, \`created_by_column\` varchar(255) NULL, \`title_column\` varchar(255) NOT NULL, \`description_column\` varchar(255) NULL, \`value_column\` int NOT NULL, \`value_type_column\` varchar(255) NOT NULL DEFAULT 'percentage', \`type_column\` varchar(255) NOT NULL DEFAULT 'percent_order', \`max_usage_column\` int NOT NULL, \`min_order_value_column\` int NOT NULL DEFAULT '0', \`applicability_rule_column\` varchar(255) NOT NULL, \`duration_column\` int NOT NULL, \`usage_frequency_unit_column\` varchar(255) NOT NULL, \`usage_frequency_value_column\` int NULL, \`max_items_column\` int NULL, \`payment_methods_column\` json NULL, \`product_slugs_column\` json NULL, UNIQUE INDEX \`IDX_ae3624550da86c4a6cc10d3b3d\` (\`slug_column\`), PRIMARY KEY (\`id_column\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_ae3624550da86c4a6cc10d3b3d\` ON \`voucher_campaign_template_tbl\``,
    );
    await queryRunner.query(`DROP TABLE \`voucher_campaign_template_tbl\``);
  }
}
