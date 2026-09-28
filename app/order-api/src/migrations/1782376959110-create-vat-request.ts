import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVatRequest1782376959110 implements MigrationInterface {
  name = 'CreateVatRequest1782376959110';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`vat_request_tbl\` (
        \`id_column\` varchar(36) NOT NULL,
        \`slug_column\` varchar(255) NOT NULL,
        \`created_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` datetime(6) NULL,
        \`created_by_column\` varchar(255) NULL,
        \`customer_name_column\` varchar(255) NOT NULL,
        \`tax_code_column\` varchar(20) NOT NULL,
        \`address_column\` text NOT NULL,
        \`email_column\` varchar(255) NOT NULL,
        \`company_name_column\` varchar(255) NULL,
        \`note_column\` text NULL,
        \`status_column\` varchar(20) NOT NULL DEFAULT 'PENDING',
        \`invoice_number_column\` varchar(50) NULL,
        \`accountant_note_column\` text NULL,
        \`invoice_id_column\` varchar(36) NOT NULL,
        UNIQUE INDEX \`IDX_vat_request_slug\` (\`slug_column\`),
        UNIQUE INDEX \`IDX_vat_request_invoice_id\` (\`invoice_id_column\`),
        PRIMARY KEY (\`id_column\`)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`vat_request_tbl\` ADD CONSTRAINT \`FK_vat_request_invoice\` FOREIGN KEY (\`invoice_id_column\`) REFERENCES \`invoice_tbl\`(\`id_column\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`vat_request_tbl\` DROP FOREIGN KEY \`FK_vat_request_invoice\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_vat_request_invoice_id\` ON \`vat_request_tbl\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_vat_request_slug\` ON \`vat_request_tbl\``,
    );
    await queryRunner.query(`DROP TABLE \`vat_request_tbl\``);
  }
}
