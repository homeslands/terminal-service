import { MigrationInterface, QueryRunner } from 'typeorm';

// Buoc 3.4 (giai doan 3) - cot trang thai khoa CUC BO cua `user_tbl` khong con
// ai doc de quyet dinh: khoa/mo tai khoan nam o `shared-user` tu giai doan 1
// (`UserActiveChecker`, `JwtStrategy`), `UserResponseDto.isActive` duoc gan tu
// identity. Entity `User` bo field `isActive` trong cung buoc.
//
// Cot NAY VAN CON NGUOI DOC/GHI: `scripts/backfill-shared-user-ids.ts` va
// `user/user-retire.helper.ts` (giu toi cuoi du an - Phu luc D, quy dinh 2).
// Chung khong doc qua entity ma qua `user/user-legacy-column.helper.ts`, do ten
// cot (`is_active_column` / `_deprecated_is_active_column`), nen chay dung ca
// truoc lan sau migration nay.
//
// ⛔ DOI TEN, KHONG xoa: `DROP` that chi o giai doan 10, sau khi script da chay
// va doi chieu xong tren CHINH moi truong do (quy dinh 1).
//
// CHI `user_tbl`. Ten cot nay con co tren muoi bang khac nhung la cot cua chinh
// chung (trang thai banner, san pham, voucher...) - khong nhac ten bang nao khac.
//
// `RENAME COLUMN` (MySQL 8) giu nguyen kieu, NOT NULL va `DEFAULT 1`, nen lenh
// INSERT cua entity (khong con khai cot nay) van chay: hang moi nhan mac dinh 1.
//
// So hieu `-04`: dan day 15/11/2026 (nguoi dung chot) - 3.4 lay `-04`, 4.7 sang
// `-05`, 5.1 sang `-06`, giai doan 8 tu `-07`. Timestamp sau 3.3 (`…200`).
const TABLE = 'user_tbl';
const COLUMN = 'is_active_column';
const DEPRECATED = '_deprecated_is_active_column';

export class DeprecateUserIsActiveColumn1786700000300
  implements MigrationInterface
{
  name = 'DeprecateUserIsActiveColumn1786700000300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const original = await queryRunner.hasColumn(TABLE, COLUMN);
    const deprecated = await queryRunner.hasColumn(TABLE, DEPRECATED);
    if (original && deprecated) {
      throw new Error(`${TABLE} co ca ${COLUMN} lan ${DEPRECATED}`);
    }
    if (!original) return;
    await queryRunner.query(
      'ALTER TABLE `user_tbl` RENAME COLUMN `is_active_column` TO `_deprecated_is_active_column`',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const original = await queryRunner.hasColumn(TABLE, COLUMN);
    const deprecated = await queryRunner.hasColumn(TABLE, DEPRECATED);
    if (original && deprecated) {
      throw new Error(`${TABLE} co ca ${COLUMN} lan ${DEPRECATED}`);
    }
    if (!deprecated) return;
    await queryRunner.query(
      'ALTER TABLE `user_tbl` RENAME COLUMN `_deprecated_is_active_column` TO `is_active_column`',
    );
  }
}
