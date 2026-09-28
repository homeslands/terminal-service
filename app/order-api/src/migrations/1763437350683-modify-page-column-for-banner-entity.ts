import { MigrationInterface, QueryRunner } from 'typeorm';

export class ModifyPageColumnForBannerEntity1763437350683
  implements MigrationInterface
{
  name = 'ModifyPageColumnForBannerEntity1763437350683';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`banner_tbl\` CHANGE \`page_column\` \`page_column\` varchar(255) NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`banner_tbl\` CHANGE \`page_column\` \`page_column\` varchar(255) NULL`,
    );
  }
}
