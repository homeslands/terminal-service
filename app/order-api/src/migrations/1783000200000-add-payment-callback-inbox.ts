import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentCallbackInbox1783000200000
  implements MigrationInterface
{
  name = 'AddPaymentCallbackInbox1783000200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`payment_callback_inbox_tbl\` (\`id_column\` varchar(36) NOT NULL, \`slug_column\` varchar(255) NOT NULL, \`created_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at_column\` datetime(6) NULL, \`created_by_column\` varchar(255) NULL, \`trace_number_column\` varchar(255) NOT NULL, \`route_code_column\` varchar(255) NULL, \`status_column\` varchar(255) NOT NULL DEFAULT 'received', \`raw_payload_column\` text NOT NULL, \`retry_count_column\` int NOT NULL DEFAULT '0', \`last_error_column\` text NULL, UNIQUE INDEX \`IDX_payment_callback_inbox_slug\` (\`slug_column\`), UNIQUE INDEX \`IDX_payment_callback_inbox_trace_number\` (\`trace_number_column\`), PRIMARY KEY (\`id_column\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_payment_callback_inbox_trace_number\` ON \`payment_callback_inbox_tbl\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_payment_callback_inbox_slug\` ON \`payment_callback_inbox_tbl\``,
    );
    await queryRunner.query(`DROP TABLE \`payment_callback_inbox_tbl\``);
  }
}
