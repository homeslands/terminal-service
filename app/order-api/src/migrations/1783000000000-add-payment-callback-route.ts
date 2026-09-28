import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentCallbackRoute1783000000000
  implements MigrationInterface
{
  name = 'AddPaymentCallbackRoute1783000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`payment_callback_route_tbl\` (\`id_column\` varchar(36) NOT NULL, \`slug_column\` varchar(255) NOT NULL, \`created_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at_column\` datetime(6) NULL, \`created_by_column\` varchar(255) NULL, \`code_column\` varchar(255) NOT NULL, \`service_type_column\` varchar(255) NOT NULL DEFAULT 'internal', \`target_url_column\` varchar(255) NULL, \`target_api_key_column\` varchar(255) NULL, \`timeout_ms_column\` int NOT NULL DEFAULT '15000', \`is_active_column\` tinyint NOT NULL DEFAULT 1, \`description_column\` varchar(255) NULL, UNIQUE INDEX \`IDX_payment_callback_route_slug\` (\`slug_column\`), UNIQUE INDEX \`IDX_payment_callback_route_code\` (\`code_column\`), PRIMARY KEY (\`id_column\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_payment_callback_route_code\` ON \`payment_callback_route_tbl\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_payment_callback_route_slug\` ON \`payment_callback_route_tbl\``,
    );
    await queryRunner.query(`DROP TABLE \`payment_callback_route_tbl\``);
  }
}
