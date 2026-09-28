import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRelationPrinterJobAndPrinterEventEntity1765335085860
  implements MigrationInterface
{
  name = 'AddRelationPrinterJobAndPrinterEventEntity1765335085860';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`printer_event_tbl\` ADD \`printer_job_column\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`printer_event_tbl\` ADD CONSTRAINT \`FK_9e17a377d1fb66e9c2d2358b53f\` FOREIGN KEY (\`printer_job_column\`) REFERENCES \`printer_job_tbl\`(\`id_column\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`printer_event_tbl\` DROP FOREIGN KEY \`FK_9e17a377d1fb66e9c2d2358b53f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`printer_event_tbl\` DROP COLUMN \`printer_job_column\``,
    );
  }
}
