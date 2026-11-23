import { MigrationInterface, QueryRunner } from 'typeorm';

// Buoc 8.9 (2/3) - muoi cot identity cuc bo cua `user_tbl` doi ten
// `_deprecated_*` (entity da bo chung o buoc 8.8). Du lieu o lai toi giai doan
// 10 (dot phat hanh B, quy dinh 1).
//
// Quy dinh 4 (chot 14/11/2026): cot NOT NULL khong DEFAULT phai `MODIFY ...
// NULL` TRUOC khi doi ten - `phonenumber_column` (do 19/11/2026 tren ba DB).
// Thieu buoc nay thi tu ban 8.8 moi `INSERT user_tbl` hong
// (`STRICT_TRANS_TABLES`: field khong co gia tri mac dinh), ke ca hang khach
// cua script backfill terminal va `UserProvisioningService`.
// UNIQUE cua `phonenumber_column` / `email_column` giu nguyen: hang moi mang
// NULL, MySQL cho nhieu NULL trong unique index.
//
// QD22: cung dot nay doi ten `membership_card_tbl`, `user_requirement_tbl` cuc
// bo (khong ai ghi tu buoc 2.5) - go khoa ngoai sang `user_tbl` truoc.

const TABLE = 'user_tbl';
const PREFIX = '_deprecated_';
const COLUMNS = [
  'phonenumber_column',
  'password_column',
  'first_name_column',
  'last_name_column',
  'language_column',
  'dob_column',
  'dob_day_month',
  'email_column',
  'address_column',
  'image_column',
] as const;
// Cot NOT NULL khong DEFAULT truoc buoc nay (do 19/11/2026) - `down` tra lai
// NOT NULL cho chung neu du lieu cho phep.
const NOT_NULL_WITHOUT_DEFAULT = ['phonenumber_column'];
// QD22 - ten khoa ngoai TypeORM sinh (tat dinh), chi dung cho `down`.
const QD22_TABLES = [
  { table: 'membership_card_tbl', fk: 'FK_5d75f750ec2f41e14ed3dfea950' },
  { table: 'user_requirement_tbl', fk: 'FK_1a4d44b60a83d21206e567325a2' },
];

type ColumnInfo = { type: string; nullable: string; hasDefault: number };

export class DeprecateUserIdentityColumns1787400000100
  implements MigrationInterface
{
  name = 'DeprecateUserIdentityColumns1787400000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const column of COLUMNS) {
      const deprecated = `${PREFIX}${column}`;
      if (!(await this.hasOnly(queryRunner, TABLE, column, deprecated)))
        continue;
      const info = await this.columnInfo(queryRunner, column);
      if (info && info.nullable === 'NO' && !info.hasDefault) {
        await queryRunner.query(
          `ALTER TABLE \`${TABLE}\` MODIFY \`${column}\` ${info.type} NULL`,
        );
      }
      await queryRunner.query(
        `ALTER TABLE \`${TABLE}\` RENAME COLUMN \`${column}\` TO \`${deprecated}\``,
      );
    }

    for (const { table } of QD22_TABLES) {
      const deprecated = `${PREFIX}${table}`;
      if (!(await this.hasOnlyTable(queryRunner, table, deprecated))) continue;
      const foreignKeys: Array<{ name: string }> = await queryRunner.query(
        `SELECT CONSTRAINT_NAME AS name FROM information_schema.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
            AND REFERENCED_TABLE_NAME = ?`,
        [table, TABLE],
      );
      for (const { name } of foreignKeys) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${name}\``,
        );
      }
      await queryRunner.query(`RENAME TABLE \`${table}\` TO \`${deprecated}\``);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { table, fk } of QD22_TABLES) {
      const deprecated = `${PREFIX}${table}`;
      if (!(await this.hasOnlyTable(queryRunner, deprecated, table))) continue;
      await queryRunner.query(`RENAME TABLE \`${deprecated}\` TO \`${table}\``);
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${fk}\` FOREIGN KEY (\`user_column\`) REFERENCES \`${TABLE}\`(\`id_column\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
    }

    for (const column of COLUMNS) {
      const deprecated = `${PREFIX}${column}`;
      if (!(await this.hasOnly(queryRunner, TABLE, deprecated, column)))
        continue;
      await queryRunner.query(
        `ALTER TABLE \`${TABLE}\` RENAME COLUMN \`${deprecated}\` TO \`${column}\``,
      );
    }

    // Tra NOT NULL chi khi khong co hang NULL. Hang tao tu ban 8.8 khong co SDT
    // cuc bo - ep NOT NULL se hong (STRICT) hoac phai bia gia tri. De nullable
    // van chay duoc voi ma truoc 8.8 (ma do luon ghi cot nay khi tao hang).
    for (const column of NOT_NULL_WITHOUT_DEFAULT) {
      const info = await this.columnInfo(queryRunner, column);
      if (!info || info.nullable === 'NO') continue;
      const [{ nulls }] = await queryRunner.query(
        `SELECT COUNT(*) AS nulls FROM \`${TABLE}\` WHERE \`${column}\` IS NULL`,
      );
      if (Number(nulls) > 0) continue;
      await queryRunner.query(
        `ALTER TABLE \`${TABLE}\` MODIFY \`${column}\` ${info.type} NOT NULL`,
      );
    }
  }

  private async columnInfo(
    queryRunner: QueryRunner,
    column: string,
  ): Promise<ColumnInfo | null> {
    const [row]: ColumnInfo[] = await queryRunner.query(
      `SELECT COLUMN_TYPE AS type, IS_NULLABLE AS nullable,
              COLUMN_DEFAULT IS NOT NULL AS hasDefault
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [TABLE, column],
    );
    return row ? { ...row, hasDefault: Number(row.hasDefault) } : null;
  }

  /** `from` co, `to` chua co => doi; `from` da het => bo qua; co ca hai => nem. */
  private async hasOnly(
    queryRunner: QueryRunner,
    table: string,
    from: string,
    to: string,
  ): Promise<boolean> {
    const hasFrom = await queryRunner.hasColumn(table, from);
    const hasTo = await queryRunner.hasColumn(table, to);
    if (hasFrom && hasTo) throw new Error(`${table} co ca ${from} lan ${to}`);
    return hasFrom;
  }

  private async hasOnlyTable(
    queryRunner: QueryRunner,
    from: string,
    to: string,
  ): Promise<boolean> {
    const hasFrom = await queryRunner.hasTable(from);
    const hasTo = await queryRunner.hasTable(to);
    if (hasFrom && hasTo) throw new Error(`Co ca bang ${from} lan ${to}`);
    return hasFrom;
  }
}
