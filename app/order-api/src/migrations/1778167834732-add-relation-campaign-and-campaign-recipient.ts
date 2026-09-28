import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRelationCampaignAndCampaignRecipient1778167834732
  implements MigrationInterface
{
  name = 'AddRelationCampaignAndCampaignRecipient1778167834732';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`campaign_recipient_tbl\` ADD \`campaign_column\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_recipient_tbl\` ADD CONSTRAINT \`FK_7677f90724cd5eba305d557effa\` FOREIGN KEY (\`campaign_column\`) REFERENCES \`campaign_tbl\`(\`id_column\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`campaign_recipient_tbl\` DROP FOREIGN KEY \`FK_7677f90724cd5eba305d557effa\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_recipient_tbl\` DROP COLUMN \`campaign_column\``,
    );
  }
}
