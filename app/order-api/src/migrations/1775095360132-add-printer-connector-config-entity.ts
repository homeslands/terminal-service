import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrinterConnectorConfigEntity1775095360132
  implements MigrationInterface
{
  name = 'AddPrinterConnectorConfigEntity1775095360132';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`printer_connector_tbl\` (\`id_column\` varchar(36) NOT NULL, \`slug_column\` varchar(255) NOT NULL, \`created_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at_column\` datetime(6) NULL, \`created_by_column\` varchar(255) NULL, \`url_column\` varchar(255) NOT NULL, \`api_key_column\` varchar(255) NOT NULL, UNIQUE INDEX \`IDX_9c3ae3c00ab91e79cc568b9e50\` (\`slug_column\`), PRIMARY KEY (\`id_column\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_9c3ae3c00ab91e79cc568b9e50\` ON \`printer_connector_tbl\``,
    );
    await queryRunner.query(`DROP TABLE \`printer_connector_tbl\``);
  }
}
