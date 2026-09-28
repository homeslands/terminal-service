import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitWorkShiftEntity1782691200000 implements MigrationInterface {
  name = 'InitWorkShiftEntity1782691200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`work_shift_tbl\` (\`id_column\` varchar(36) NOT NULL, \`slug_column\` varchar(255) NOT NULL, \`created_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at_column\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at_column\` datetime(6) NULL, \`created_by_column\` varchar(255) NULL, \`cashier_column\` varchar(36) NOT NULL, \`branch_column\` varchar(36) NOT NULL, \`actual_start_time_column\` timestamp NOT NULL, \`actual_end_time_column\` timestamp NULL, \`status_column\` enum('ACTIVE','CLOSED') NOT NULL DEFAULT 'ACTIVE', \`opening_cash_column\` decimal(10,2) NOT NULL DEFAULT '0.00', \`closing_cash_column\` decimal(10,2) NULL, \`note_column\` text NULL, UNIQUE INDEX \`IDX_work_shift_slug\` (\`slug_column\`), INDEX \`IDX_work_shift_branch_status\` (\`branch_column\`, \`status_column\`), INDEX \`IDX_work_shift_cashier\` (\`cashier_column\`), PRIMARY KEY (\`id_column\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`work_shift_tbl\` ADD CONSTRAINT \`FK_work_shift_cashier\` FOREIGN KEY (\`cashier_column\`) REFERENCES \`user_tbl\`(\`id_column\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`work_shift_tbl\` ADD CONSTRAINT \`FK_work_shift_branch\` FOREIGN KEY (\`branch_column\`) REFERENCES \`branch_tbl\`(\`id_column\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`work_shift_tbl\` DROP FOREIGN KEY \`FK_work_shift_branch\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`work_shift_tbl\` DROP FOREIGN KEY \`FK_work_shift_cashier\``,
    );
    await queryRunner.query(`DROP TABLE \`work_shift_tbl\``);
  }
}
