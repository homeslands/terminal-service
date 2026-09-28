import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitRegisterOtpTokenEntity1779412616573
  implements MigrationInterface
{
  name = 'InitRegisterOtpTokenEntity1779412616573';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`register_otp_token_tbl\` (\`id_column\` varchar(36) NOT NULL, \`slug_column\` varchar(255) NOT NULL, \`created_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at_column\` datetime(6) NULL, \`created_by_column\` varchar(255) NULL, \`phonenumber_column\` varchar(255) NOT NULL, \`token_column\` varchar(255) NOT NULL, \`expires_at_column\` datetime NOT NULL, \`last_sent_at_column\` timestamp NULL, \`attempt_count_column\` int NOT NULL DEFAULT '0', \`is_used_column\` tinyint NOT NULL DEFAULT 0, INDEX \`IDX_7576cbbb5e0b661e9c120ffd9a\` (\`phonenumber_column\`), UNIQUE INDEX \`IDX_703d7462cf0354f82b84725db0\` (\`slug_column\`), PRIMARY KEY (\`id_column\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_703d7462cf0354f82b84725db0\` ON \`register_otp_token_tbl\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_7576cbbb5e0b661e9c120ffd9a\` ON \`register_otp_token_tbl\``,
    );
    await queryRunner.query(`DROP TABLE \`register_otp_token_tbl\``);
  }
}
