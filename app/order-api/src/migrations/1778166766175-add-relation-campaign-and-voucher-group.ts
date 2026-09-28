import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRelationCampaignAndVoucherGroup1778166766175
  implements MigrationInterface
{
  name = 'AddRelationCampaignAndVoucherGroup1778166766175';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`campaign_tbl\` ADD \`voucher_group_column\` varchar(36) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_tbl\` ADD CONSTRAINT \`FK_e942bef77d295e38f7a8e80203a\` FOREIGN KEY (\`voucher_group_column\`) REFERENCES \`voucher_group_tbl\`(\`id_column\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`campaign_tbl\` DROP FOREIGN KEY \`FK_e942bef77d295e38f7a8e80203a\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_tbl\` DROP COLUMN \`voucher_group_column\``,
    );
  }
}
