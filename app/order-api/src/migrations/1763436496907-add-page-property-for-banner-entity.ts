import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPagePropertyForBannerEntity1763436496907
  implements MigrationInterface
{
  name = 'AddPagePropertyForBannerEntity1763436496907';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`banner_tbl\` ADD \`page_column\` varchar(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`banner_tbl\` DROP COLUMN \`page_column\``,
    );
  }
}
