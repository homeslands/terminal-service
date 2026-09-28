import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRelationUserAndUserRequirementEntity1768465416536
  implements MigrationInterface
{
  name = 'AddRelationUserAndUserRequirementEntity1768465416536';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`user_requirement_tbl\` ADD \`user_column\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_requirement_tbl\` ADD CONSTRAINT \`FK_1a4d44b60a83d21206e567325a2\` FOREIGN KEY (\`user_column\`) REFERENCES \`user_tbl\`(\`id_column\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`user_requirement_tbl\` DROP FOREIGN KEY \`FK_1a4d44b60a83d21206e567325a2\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_requirement_tbl\` DROP COLUMN \`user_column\``,
    );
  }
}
