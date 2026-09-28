import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentCallbackForwardLog1783000100000
  implements MigrationInterface
{
  name = 'AddPaymentCallbackForwardLog1783000100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`payment_callback_forward_log_tbl\` (\`id_column\` varchar(36) NOT NULL, \`slug_column\` varchar(255) NOT NULL, \`created_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at_column\` datetime(6) NULL, \`created_by_column\` varchar(255) NULL, \`route_code_column\` varchar(255) NULL, \`target_url_column\` varchar(255) NULL, \`trace_number_column\` varchar(255) NULL, \`transaction_status_column\` varchar(255) NULL, \`transaction_channel_column\` varchar(255) NULL, \`transaction_date_column\` varchar(255) NULL, \`effective_date_column\` varchar(255) NULL, \`debit_or_credit_column\` varchar(255) NULL, \`amount_column\` decimal(10,2) NULL, \`transaction_content_column\` text NULL, \`beneficiary_name_column\` varchar(255) NULL, \`virtual_account_column\` varchar(255) NULL, \`raw_payload_column\` text NULL, UNIQUE INDEX \`IDX_payment_callback_forward_log_slug\` (\`slug_column\`), INDEX \`IDX_payment_callback_forward_log_trace_number\` (\`trace_number_column\`), PRIMARY KEY (\`id_column\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_payment_callback_forward_log_trace_number\` ON \`payment_callback_forward_log_tbl\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_payment_callback_forward_log_slug\` ON \`payment_callback_forward_log_tbl\``,
    );
    await queryRunner.query(`DROP TABLE \`payment_callback_forward_log_tbl\``);
  }
}
