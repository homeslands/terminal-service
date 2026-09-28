import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkShiftForInvoiceEntity1782691200002
  implements MigrationInterface
{
  name = 'AddWorkShiftForInvoiceEntity1782691200002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`invoice_tbl\` ADD COLUMN \`work_shift_column\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`invoice_tbl\` ADD CONSTRAINT \`FK_invoice_work_shift\` FOREIGN KEY (\`work_shift_column\`) REFERENCES \`work_shift_tbl\`(\`id_column\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_invoice_work_shift\` ON \`invoice_tbl\` (\`work_shift_column\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`invoice_tbl\` DROP FOREIGN KEY \`FK_invoice_work_shift\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_invoice_work_shift\` ON \`invoice_tbl\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`invoice_tbl\` DROP COLUMN \`work_shift_column\``,
    );
  }
}
