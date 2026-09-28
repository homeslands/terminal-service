import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerTypeForVoucher1764577935050
  implements MigrationInterface
{
  name = 'AddCustomerTypeForVoucher1764577935050';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` ADD \`customer_type_column\` varchar(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` DROP COLUMN \`customer_type_column\``,
    );
  }
}
