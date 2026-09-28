import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRelationBranchAndPrinterConnectorConfig1775098451429
  implements MigrationInterface
{
  name = 'AddRelationBranchAndPrinterConnectorConfig1775098451429';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`printer_connector_tbl\` ADD \`branch_column\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`printer_connector_tbl\` ADD UNIQUE INDEX \`IDX_4cbc27f3b18c1eb325e3157674\` (\`branch_column\`)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`REL_4cbc27f3b18c1eb325e3157674\` ON \`printer_connector_tbl\` (\`branch_column\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`printer_connector_tbl\` ADD CONSTRAINT \`FK_4cbc27f3b18c1eb325e3157674b\` FOREIGN KEY (\`branch_column\`) REFERENCES \`branch_tbl\`(\`id_column\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`printer_connector_tbl\` DROP FOREIGN KEY \`FK_4cbc27f3b18c1eb325e3157674b\``,
    );
    await queryRunner.query(
      `DROP INDEX \`REL_4cbc27f3b18c1eb325e3157674\` ON \`printer_connector_tbl\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`printer_connector_tbl\` DROP INDEX \`IDX_4cbc27f3b18c1eb325e3157674\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`printer_connector_tbl\` DROP COLUMN \`branch_column\``,
    );
  }
}
