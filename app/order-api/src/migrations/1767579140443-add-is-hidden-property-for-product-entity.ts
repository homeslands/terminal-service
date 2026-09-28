import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsHiddenPropertyForProductEntity1767579140443
  implements MigrationInterface
{
  name = 'AddIsHiddenPropertyForProductEntity1767579140443';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`product_tbl\` ADD \`is_hidden_column\` tinyint NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`product_tbl\` DROP COLUMN \`is_hidden_column\``,
    );
  }
}
