import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrinterIdOfPrinterClientForPrinterEntity1775459589212
  implements MigrationInterface
{
  name = 'AddPrinterIdOfPrinterClientForPrinterEntity1775459589212';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`printer_tbl\` ADD \`printer_id_column\` varchar(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`printer_tbl\` DROP COLUMN \`printer_id_column\``,
    );
  }
}
