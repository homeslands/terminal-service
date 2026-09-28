import { MigrationInterface, QueryRunner } from 'typeorm';

export class ModifyCustomerTypeForVoucherEntity1764579258818
  implements MigrationInterface
{
  name = 'ModifyCustomerTypeForVoucherEntity1764579258818';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` CHANGE \`customer_type_column\` \`customer_type_column\` varchar(255) NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`voucher_tbl\` CHANGE \`customer_type_column\` \`customer_type_column\` varchar(255) NULL`,
    );
  }
}
