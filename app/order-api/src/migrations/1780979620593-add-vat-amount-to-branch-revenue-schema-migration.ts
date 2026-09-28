import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVatAmountToBranchRevenueSchemaMigration1780979620593
  implements MigrationInterface
{
  name = 'AddVatAmountToBranchRevenueSchemaMigration1780979620593';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`branch_revenue_tbl\` ADD COLUMN \`vat_amount_column\` int NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`branch_revenue_tbl\` DROP COLUMN \`vat_amount_column\``,
    );
  }
}
