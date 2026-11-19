import { MigrationInterface, QueryRunner } from 'typeorm';

// Buoc 4.7 (giai doan 4) - hai co xac minh CUC BO cua `user_tbl` (email, SDT)
// khong con ai doc de tra loi client. Gia tri that nam o `shared-user`;
// `UserResponseDto` va `AuthProfileResponseDto` van khai hai field va gan tu
// identity (`user.helper.ts`, `user.service.ts`, `auth.service.ts`). Entity
// `User` bo hai field trong cung buoc.
//
// Hai cot nay VAN CON NGUOI DOC: `scripts/backfill-shared-user-ids.ts` (giu toi
// cuoi du an - Phu luc D, quy dinh 2) doc qua `user/user-legacy-column.helper.ts`,
// do ten cot (`<ten>` / `_deprecated_<ten>`), nen chay dung ca truoc lan sau
// migration nay.
//
// So hieu `-05` theo bang day so muc 0 cua `buoc-trien-khai-gd2-10-terminal.md`
// (dan day 15/11/2026). Timestamp sau 3.4 (`…300`).
//
// ⛔ DOI TEN, KHONG xoa: `DROP` that chi o giai doan 10, sau khi script da chay
// va doi chieu xong tren CHINH moi truong do (quy dinh 1).
//
// `RENAME COLUMN` (MySQL 8) giu nguyen kieu, NOT NULL va `DEFAULT 0` (do
// 16/11/2026 tren DB local), nen lenh INSERT cua entity (khong con khai hai cot
// nay) van chay: hang moi nhan mac dinh 0 o cot da doi ten.
//
// Moi cot kiem ten rieng truoc khi doi (ca `up()` lan `down()`): DDL cua MySQL
// tu commit tung lenh, nen lan chay do dang (doi xong cot dau) chay lai duoc.
// Thay CA HAI ten cua mot cot thi nem loi thay vi bo qua: chon bua mot ben la
// doc nham nua du lieu.
const TABLE = 'user_tbl';
const COLUMNS = [
  'is_verified_email_column',
  'is_verified_phonenumber_column',
] as const;
const DEPRECATED_PREFIX = '_deprecated_';

export class DeprecateUserVerifiedFlagColumns1786700000400
  implements MigrationInterface
{
  name = 'DeprecateUserVerifiedFlagColumns1786700000400';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const column of COLUMNS) {
      const deprecated = `${DEPRECATED_PREFIX}${column}`;
      if (!(await this.hasOnly(queryRunner, column, deprecated))) continue;
      await queryRunner.query(
        `ALTER TABLE \`${TABLE}\` RENAME COLUMN \`${column}\` TO \`${deprecated}\``,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of COLUMNS) {
      const deprecated = `${DEPRECATED_PREFIX}${column}`;
      if (!(await this.hasOnly(queryRunner, deprecated, column))) continue;
      await queryRunner.query(
        `ALTER TABLE \`${TABLE}\` RENAME COLUMN \`${deprecated}\` TO \`${column}\``,
      );
    }
  }

  /** `from` co, `to` chua co => doi; `from` da het => bo qua; co ca hai => nem. */
  private async hasOnly(
    queryRunner: QueryRunner,
    from: string,
    to: string,
  ): Promise<boolean> {
    const hasFrom = await queryRunner.hasColumn(TABLE, from);
    const hasTo = await queryRunner.hasColumn(TABLE, to);
    if (hasFrom && hasTo) {
      throw new Error(`${TABLE} co ca ${from} lan ${to}`);
    }
    return hasFrom;
  }
}
