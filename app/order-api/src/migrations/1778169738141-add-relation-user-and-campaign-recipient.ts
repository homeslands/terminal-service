import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRelationUserAndCampaignRecipient1778169738141
  implements MigrationInterface
{
  name = 'AddRelationUserAndCampaignRecipient1778169738141';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`campaign_recipient_tbl\` ADD \`user_column\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_recipient_tbl\` ADD CONSTRAINT \`FK_764d785688fb1592ef744dca6b6\` FOREIGN KEY (\`user_column\`) REFERENCES \`user_tbl\`(\`id_column\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`campaign_recipient_tbl\` DROP FOREIGN KEY \`FK_764d785688fb1592ef744dca6b6\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_recipient_tbl\` DROP COLUMN \`user_column\``,
    );
  }
}
