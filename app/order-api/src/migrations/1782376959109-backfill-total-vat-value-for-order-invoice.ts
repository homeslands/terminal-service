import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillTotalVatValueForOrderInvoice1782376959109
  implements MigrationInterface
{
  name = 'BackfillTotalVatValueForOrderInvoice1782376959109';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`order_tbl\` o
      SET o.\`total_vat_value_column\` = (
        SELECT COALESCE(SUM(oi.\`vat_value_column\`), 0)
        FROM \`order_item_tbl\` oi
        WHERE oi.\`order_column\` = o.\`id_column\`
          AND oi.\`deleted_at_column\` IS NULL
      )
      WHERE o.\`deleted_at_column\` IS NULL
    `);

    await queryRunner.query(`
      UPDATE \`invoice_tbl\` i
      SET i.\`total_vat_value_column\` = (
        SELECT COALESCE(SUM(ii.\`vat_value_column\`), 0)
        FROM \`invoice_item_tbl\` ii
        WHERE ii.\`invoice_column\` = i.\`id_column\`
          AND ii.\`deleted_at_column\` IS NULL
      )
      WHERE i.\`deleted_at_column\` IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE \`order_tbl\` SET \`total_vat_value_column\` = 0`,
    );
    await queryRunner.query(
      `UPDATE \`invoice_tbl\` SET \`total_vat_value_column\` = 0`,
    );
  }
}
