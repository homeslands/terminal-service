import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitCardMembershipEntity1768011981119
  implements MigrationInterface
{
  name = 'InitCardMembershipEntity1768011981119';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`membership_card_tbl\` (\`id_column\` varchar(36) NOT NULL, \`slug_column\` varchar(255) NOT NULL, \`created_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at_column\` datetime(6) NULL, \`created_by_column\` varchar(255) NULL, \`code_column\` varchar(255) NOT NULL, \`is_active_column\` tinyint NOT NULL DEFAULT 1, \`expired_at_column\` timestamp NULL, UNIQUE INDEX \`IDX_8d60da614d349d035ca2e621ad\` (\`slug_column\`), UNIQUE INDEX \`IDX_d115be6968657874febccdf59e\` (\`code_column\`), PRIMARY KEY (\`id_column\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_d115be6968657874febccdf59e\` ON \`membership_card_tbl\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_8d60da614d349d035ca2e621ad\` ON \`membership_card_tbl\``,
    );
    await queryRunner.query(`DROP TABLE \`membership_card_tbl\``);
  }
}
