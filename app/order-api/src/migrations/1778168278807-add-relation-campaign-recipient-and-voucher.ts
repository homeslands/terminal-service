import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRelationCampaignRecipientAndVoucher1778168278807
  implements MigrationInterface
{
  name = 'AddRelationCampaignRecipientAndVoucher1778168278807';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`campaign_recipient_tbl\` ADD \`voucher_column\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`REL_7307238580a267dbfa650a7d26\` ON \`campaign_recipient_tbl\` (\`voucher_column\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_recipient_tbl\` ADD CONSTRAINT \`FK_7307238580a267dbfa650a7d26d\` FOREIGN KEY (\`voucher_column\`) REFERENCES \`voucher_tbl\`(\`id_column\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`campaign_recipient_tbl\` DROP FOREIGN KEY \`FK_7307238580a267dbfa650a7d26d\``,
    );
    await queryRunner.query(
      `DROP INDEX \`REL_7307238580a267dbfa650a7d26\` ON \`campaign_recipient_tbl\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_recipient_tbl\` DROP COLUMN \`voucher_column\``,
    );
  }
}
