import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueConstraintUserAndKeyInUserRequirementEntity1768530383096
  implements MigrationInterface
{
  name = 'AddUniqueConstraintUserAndKeyInUserRequirementEntity1768530383096';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`UQ_user_requirement_key_user\` ON \`user_requirement_tbl\` (\`key_column\`, \`user_column\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`UQ_user_requirement_key_user\` ON \`user_requirement_tbl\``,
    );
  }
}
