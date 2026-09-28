import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRelationUserAndCardMembershipEntity1768012390693
  implements MigrationInterface
{
  name = 'AddRelationUserAndCardMembershipEntity1768012390693';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`membership_card_tbl\` ADD \`user_column\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`REL_5d75f750ec2f41e14ed3dfea95\` ON \`membership_card_tbl\` (\`user_column\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`membership_card_tbl\` ADD CONSTRAINT \`FK_5d75f750ec2f41e14ed3dfea950\` FOREIGN KEY (\`user_column\`) REFERENCES \`user_tbl\`(\`id_column\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`membership_card_tbl\` DROP FOREIGN KEY \`FK_5d75f750ec2f41e14ed3dfea950\``,
    );
    await queryRunner.query(
      `DROP INDEX \`REL_5d75f750ec2f41e14ed3dfea95\` ON \`membership_card_tbl\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`membership_card_tbl\` DROP COLUMN \`user_column\``,
    );
  }
}
