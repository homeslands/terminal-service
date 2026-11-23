import { MigrationInterface, QueryRunner } from 'typeorm';

// Buoc 8.9 (1/3) - "cot thu 11": khoa ngoai user <-> diem tich luy nam BEN
// `user_tbl` (`accumulated_point_column` -> `accumulated_point_tbl`), nguoc
// chieu voi `balance_tbl`. Khong go no thi `user_tbl` khong dat dich muc 1.6
// ma `local-identity-columns.spec.ts` cung khong bat.
//
// Go khoa ngoai + hai unique index TypeORM sinh cho quan he OneToOne (IDX_ /
// REL_), roi DOI TEN cot thanh `_deprecated_*`. Cot va du lieu o lai toi giai
// doan 10 (dot phat hanh B). Entity da bo quan he o buoc 8.8.
//
// Chay TRUOC (3/3) - doi ten `accumulated_point_tbl` khi `user_tbl` khong con
// tro vao no. `down` cua (3/3) chay truoc `down` nay (TypeORM lui nguoc thu
// tu), nen luc dung lai khoa ngoai bang dich da mang lai ten cu.

const TABLE = 'user_tbl';
const COLUMN = 'accumulated_point_column';
const DEPRECATED = `_deprecated_${COLUMN}`;
const TARGET = 'accumulated_point_tbl';
// Ten TypeORM sinh (tat dinh theo bang + cot, do 19/11/2026 tren trend_test_db,
// terminal_db, trend_db) - chi dung cho `down`; `up` do ten tren DB.
const FK_NAME = 'FK_4bf612cd5546f2fc59895eb3f51';
const INDEX_NAMES = [
  'IDX_4bf612cd5546f2fc59895eb3f5',
  'REL_4bf612cd5546f2fc59895eb3f5',
];

export class DropUserAccumulatedPointFk1787400000000
  implements MigrationInterface
{
  name = 'DropUserAccumulatedPointFk1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(TABLE, COLUMN);
    const hasDeprecated = await queryRunner.hasColumn(TABLE, DEPRECATED);
    if (hasColumn && hasDeprecated) {
      throw new Error(`${TABLE} co ca ${COLUMN} lan ${DEPRECATED}`);
    }
    if (!hasColumn) return;

    const foreignKeys: Array<{ name: string }> = await queryRunner.query(
      `SELECT CONSTRAINT_NAME AS name FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
          AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [TABLE, COLUMN],
    );
    for (const { name } of foreignKeys) {
      await queryRunner.query(
        `ALTER TABLE \`${TABLE}\` DROP FOREIGN KEY \`${name}\``,
      );
    }
    // Chi index MOT cot nay (index ghep co cot khac thi khong dung toi).
    const indexes: Array<{ name: string }> = await queryRunner.query(
      `SELECT INDEX_NAME AS name FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME <> 'PRIMARY'
        GROUP BY INDEX_NAME
        HAVING COUNT(*) = 1 AND SUM(COLUMN_NAME = ?) = 1`,
      [TABLE, COLUMN],
    );
    for (const { name } of indexes) {
      await queryRunner.query(
        `ALTER TABLE \`${TABLE}\` DROP INDEX \`${name}\``,
      );
    }
    await queryRunner.query(
      `ALTER TABLE \`${TABLE}\` RENAME COLUMN \`${COLUMN}\` TO \`${DEPRECATED}\``,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(TABLE, COLUMN);
    const hasDeprecated = await queryRunner.hasColumn(TABLE, DEPRECATED);
    if (hasColumn && hasDeprecated) {
      throw new Error(`${TABLE} co ca ${COLUMN} lan ${DEPRECATED}`);
    }
    if (!hasDeprecated) return;

    await queryRunner.query(
      `ALTER TABLE \`${TABLE}\` RENAME COLUMN \`${DEPRECATED}\` TO \`${COLUMN}\``,
    );
    for (const name of INDEX_NAMES) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX \`${name}\` ON \`${TABLE}\` (\`${COLUMN}\`)`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE \`${TABLE}\` ADD CONSTRAINT \`${FK_NAME}\` FOREIGN KEY (\`${COLUMN}\`) REFERENCES \`${TARGET}\`(\`id_column\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
