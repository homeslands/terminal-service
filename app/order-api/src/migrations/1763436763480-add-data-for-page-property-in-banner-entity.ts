import { BannerPage } from 'src/banner/banner.constants';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDataForPagePropertyInBannerEntity1763436763480
  implements MigrationInterface
{
  name = 'AddDataForPagePropertyInBannerEntity1763436763480';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE banner_tbl SET page_column = '${BannerPage.HOME}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE banner_tbl SET page_column = NULL`);
  }
}
