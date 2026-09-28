import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitUserRequirementEntity1768462837285
  implements MigrationInterface
{
  name = 'InitUserRequirementEntity1768462837285';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`user_requirement_tbl\` (\`id_column\` varchar(36) NOT NULL, \`slug_column\` varchar(255) NOT NULL, \`created_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at_column\` datetime(6) NULL, \`created_by_column\` varchar(255) NULL, \`key_column\` varchar(255) NOT NULL, \`level_column\` varchar(255) NOT NULL, \`status_column\` varchar(255) NOT NULL, \`scope_column\` varchar(255) NOT NULL, \`expired_at_column\` datetime NULL, \`last_updated_at_column\` datetime NULL, UNIQUE INDEX \`IDX_c4f47f34c51a74e7e055ca814d\` (\`slug_column\`), PRIMARY KEY (\`id_column\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_c4f47f34c51a74e7e055ca814d\` ON \`user_requirement_tbl\``,
    );
    await queryRunner.query(`DROP TABLE \`user_requirement_tbl\``);
  }
}
