import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotePropertyForInvoiceItemEntity1766378976710
  implements MigrationInterface
{
  name = 'AddNotePropertyForInvoiceItemEntity1766378976710';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`invoice_item_tbl\` ADD \`note_column\` varchar(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`invoice_item_tbl\` DROP COLUMN \`note_column\``,
    );
  }
}
