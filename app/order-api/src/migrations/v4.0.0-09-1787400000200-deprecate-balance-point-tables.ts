import { MigrationInterface, QueryRunner } from 'typeorm';

// Buoc 8.9 (3/3) - bon bang vi / diem roi terminal_db: doi ten `_deprecated_*`.
// So lieu that o shared-user tu cutover 7.8; tu buoc 8.7 / 8.8 terminal khong con
// repository hay entity nao tren chung. Du lieu o lai toi giai doan 10.
//
// Thu tu: bang lich su (`accumulated_point_transaction_history_tbl`, khoa
// ngoai sang `accumulated_point_tbl`) TRUOC `accumulated_point_tbl`; `down`
// nguoc lai. Khoa ngoai giua cac bang (va sang `order_tbl`, `user_tbl`) di
// theo bang khi doi ten - `order_tbl` khong bi dung toi. Hai script vi
// (`scripts/close-legacy-point-reservations.ts` / `backfill-wallet-report.ts`)
// da do ten `X` / `_deprecated_X` tu giai doan 7 (quy dinh 2).

const TABLES = [
  'accumulated_point_transaction_history_tbl',
  'accumulated_point_tbl',
  'balance_tbl',
  'point_transaction_tbl',
];
const PREFIX = '_deprecated_';

export class DeprecateBalancePointTables1787400000200
  implements MigrationInterface
{
  name = 'DeprecateBalancePointTables1787400000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      if (!(await this.hasOnly(queryRunner, table, `${PREFIX}${table}`)))
        continue;
      await queryRunner.query(
        `RENAME TABLE \`${table}\` TO \`${PREFIX}${table}\``,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [...TABLES].reverse()) {
      if (!(await this.hasOnly(queryRunner, `${PREFIX}${table}`, table)))
        continue;
      await queryRunner.query(
        `RENAME TABLE \`${PREFIX}${table}\` TO \`${table}\``,
      );
    }
  }

  /** `from` co, `to` chua co => doi; `from` da het => bo qua; co ca hai => nem. */
  private async hasOnly(
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
