import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTableBooking1782266940700 implements MigrationInterface {
  name = 'AddTableBooking1782266940700';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`table_booking_tbl\` (
    \`id_column\` varchar(36) NOT NULL,
    \`slug_column\` varchar(255) NOT NULL,
    \`created_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    \`updated_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    \`deleted_at_column\` datetime(6) DEFAULT NULL,
    \`created_by_column\` varchar(255) DEFAULT NULL,
    \`name_column\` varchar(255) NOT NULL,
    \`phone_column\` varchar(255) NOT NULL,
    \`email_column\` varchar(255) DEFAULT NULL,
    \`date_column\` timestamp NOT NULL,
    \`seats_column\` tinyint DEFAULT NULL,
    \`table_column\`  varchar(255) DEFAULT NULL,
    \`deposit_column\` int DEFAULT NULL,
    \`status_column\` varchar(255) NOT NULL DEFAULT 'Pending',
    \`note_column\` text DEFAULT NULL,
    PRIMARY KEY (\`id_column\`)
  ) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`table_booking_tbl\``);
  }
}
