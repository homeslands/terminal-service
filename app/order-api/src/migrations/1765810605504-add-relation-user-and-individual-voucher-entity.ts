import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRelationUserAndIndividualVoucherEntity1765810605504
  implements MigrationInterface
{
  name = 'AddRelationUserAndIndividualVoucherEntity1765810605504';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` ADD \`assigned_user_column\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` ADD CONSTRAINT \`FK_41388c5b693a99d260187c5c1ff\` FOREIGN KEY (\`assigned_user_column\`) REFERENCES \`user_tbl\`(\`id_column\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` DROP FOREIGN KEY \`FK_41388c5b693a99d260187c5c1ff\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` DROP COLUMN \`assigned_user_column\``,
    );
  }
}
