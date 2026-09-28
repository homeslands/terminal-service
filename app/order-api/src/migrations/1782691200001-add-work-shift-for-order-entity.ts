import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkShiftForOrderEntity1782691200001
  implements MigrationInterface
{
  name = 'AddWorkShiftForOrderEntity1782691200001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`order_tbl\` ADD COLUMN \`work_shift_column\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`order_tbl\` ADD CONSTRAINT \`FK_order_work_shift\` FOREIGN KEY (\`work_shift_column\`) REFERENCES \`work_shift_tbl\`(\`id_column\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_order_work_shift\` ON \`order_tbl\` (\`work_shift_column\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`order_tbl\` DROP FOREIGN KEY \`FK_order_work_shift\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_order_work_shift\` ON \`order_tbl\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`order_tbl\` DROP COLUMN \`work_shift_column\``,
    );
  }
}
