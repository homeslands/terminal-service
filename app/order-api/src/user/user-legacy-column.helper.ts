import { EntityManager } from 'typeorm';

/**
 * Doc/ghi cot CUC BO cua `user_tbl` ma entity `User` da bo (hoac se bo) - danh
 * cho hai noi duy nhat con can chung: `scripts/backfill-shared-user-ids.ts` va
 * `user/user-retire.helper.ts`.
 *
 * Vi sao co tep nay (Phu luc D cua `buoc-trien-khai-gd2-10-terminal.md`, quy
 * dinh 2, chot 14/11/2026): script backfill GIU toi cuoi du an vi staging/prod
 * chua chay no, va o do no se chay SAU khi `migration:run` da chay HET. Luc ay
 * cot co the da mang ten `_deprecated_<ten>` (3.4, 4.7, 8.9) hoac van ten cu
 * (moi truong da chay script truoc khi len ban moi). Doc qua field entity thi
 * gay ca hai huong: entity bo field => khong bien dich; entity giu field =>
 * TypeORM SELECT ten cu tren DB da doi ten => vo. Nen script doc/ghi bang SQL
 * tho, tu do ten cot qua `information_schema`.
 *
 * Mot nguon duy nhat cho chuyen "cot nay ten gi tren DB nay" - cac buoc 4.7 va
 * 8.9 them cot vao day, khong viet lai phep do o tung noi goi.
 */

const USER_TABLE = 'user_tbl';
const DEPRECATED_PREFIX = '_deprecated_';
// Ten cot di thang vao SQL (dinh danh khong tham so hoa duoc) => chi nhan ten
// cot dung khuon, khong bao gio nhan chuoi tu ben ngoai.
const COLUMN_NAME_PATTERN = /^[a-z_]+$/;

export const USER_IS_ACTIVE_COLUMN = 'is_active_column';
export const USER_IS_VERIFIED_EMAIL_COLUMN = 'is_verified_email_column';
export const USER_IS_VERIFIED_PHONENUMBER_COLUMN =
  'is_verified_phonenumber_column';

/**
 * Ten THAT tren DB hien tai cua mot cot `user_tbl`: `<ten>` hoac
 * `_deprecated_<ten>`.
 *
 * Nem loi - KHONG tra gia tri mac dinh - khi:
 * - khong thay ca hai ten: cot da bi `DROP` (giai doan 10) hoac DB sai. Doc
 *   "mac dinh" o day la tu che du lieu: script se gui `isActive: true` cho mot
 *   nhan vien dang bi khoa, tuc mo khoa ho ben `shared-user`;
 * - thay CA HAI ten: migration doi ten chay do dang hoac ai do tao lai cot cu.
 *   Chon bua mot ben la doc nham nua du lieu.
 */
export async function resolveUserColumn(
  manager: EntityManager,
  column: string,
): Promise<string> {
  if (!COLUMN_NAME_PATTERN.test(column)) {
    throw new Error(`Ten cot khong hop le: ${column}`);
  }
  const deprecated = `${DEPRECATED_PREFIX}${column}`;
  const rows: Array<{ name: string }> = await manager.query(
    `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME IN (?, ?)`,
    [USER_TABLE, column, deprecated],
  );
  const names = rows.map((r) => r.name);
  if (names.length === 1) return names[0];
  if (names.length === 0) {
    throw new Error(
      `${USER_TABLE} khong con cot ${column} (ca ten ${deprecated}) - ` +
        'script nay phai chay TRUOC migration DROP cua giai doan 10',
    );
  }
  throw new Error(
    `${USER_TABLE} co CA HAI cot ${column} va ${deprecated} - ` +
      'kiem migration doi ten truoc khi chay tiep',
  );
}

const toBoolean = (value: unknown): boolean | null =>
  value === null || value === undefined ? null : Number(value) !== 0;

/**
 * Trang thai khoa CUC BO cua moi hang `user_tbl`, theo `id_column`.
 *
 * Day KHONG phai trang thai khoa that - cai do o `shared-user` tu giai doan 1
 * (`UserActiveChecker`). Chi script backfill can no: nhan vien CHI CO o
 * terminal duoc nhap sang `shared-user` voi dung trang thai khoa da co o day.
 */
export async function readLocalIsActive(
  manager: EntityManager,
): Promise<Map<string, boolean>> {
  return readLocalBooleanColumn(manager, USER_IS_ACTIVE_COLUMN);
}

/** Hai co xac minh CUC BO cua mot hang `user_tbl`. */
export type LocalVerifiedFlags = {
  isVerifiedEmail: boolean;
  isVerifiedPhonenumber: boolean;
};

/**
 * Buoc 4.7 - hai co xac minh CUC BO cua moi hang `user_tbl`, theo `id_column`.
 *
 * Nhu `readLocalIsActive`: gia tri that nam o `shared-user`; chi script
 * backfill can ban cuc bo, de nhap nhan vien CHI CO o terminal sang
 * `shared-user` voi dung hai co da co o day. Hang co mot trong hai cot NULL
 * thi vang mat trong ket qua (hai cot NOT NULL nen khong xay ra tren DB dung).
 */
export async function readLocalVerifiedFlags(
  manager: EntityManager,
): Promise<Map<string, LocalVerifiedFlags>> {
  const email = await readLocalBooleanColumn(
    manager,
    USER_IS_VERIFIED_EMAIL_COLUMN,
  );
  const phonenumber = await readLocalBooleanColumn(
    manager,
    USER_IS_VERIFIED_PHONENUMBER_COLUMN,
  );
  const result = new Map<string, LocalVerifiedFlags>();
  for (const [id, isVerifiedEmail] of email) {
    const isVerifiedPhonenumber = phonenumber.get(id);
    if (isVerifiedPhonenumber === undefined) continue;
    result.set(id, { isVerifiedEmail, isVerifiedPhonenumber });
  }
  return result;
}

/** Mot cot boolean CUC BO cua moi hang `user_tbl`, theo `id_column`. */
async function readLocalBooleanColumn(
  manager: EntityManager,
  logicalColumn: string,
): Promise<Map<string, boolean>> {
  const column = await resolveUserColumn(manager, logicalColumn);
  const rows: Array<{ id: string; value: unknown }> = await manager.query(
    `SELECT \`id_column\` AS id, \`${column}\` AS value FROM \`${USER_TABLE}\``,
  );
  const result = new Map<string, boolean>();
  for (const row of rows) {
    const value = toBoolean(row.value);
    if (value !== null) result.set(row.id, value);
  }
  return result;
}

/** Nhu `readLocalIsActive` cho MOT hang; `null` khi khong co hang do. */
export async function readLocalIsActiveOf(
  manager: EntityManager,
  userId: string,
): Promise<boolean | null> {
  const column = await resolveUserColumn(manager, USER_IS_ACTIVE_COLUMN);
  const [row]: Array<{ value: unknown }> = await manager.query(
    `SELECT \`${column}\` AS value FROM \`${USER_TABLE}\` WHERE \`id_column\` = ?`,
    [userId],
  );
  return row ? toBoolean(row.value) : null;
}

/**
 * Ghi trang thai khoa cuc bo cua MOT hang. Nem loi neu khong dung dung mot
 * hang - ghi truot im lang la mot hang retire van "dang mo" o cot cu.
 */
export async function writeLocalIsActive(
  manager: EntityManager,
  userId: string,
  value: boolean,
): Promise<void> {
  const column = await resolveUserColumn(manager, USER_IS_ACTIVE_COLUMN);
  const result = await manager.query(
    `UPDATE \`${USER_TABLE}\` SET \`${column}\` = ? WHERE \`id_column\` = ?`,
    [value ? 1 : 0, userId],
  );
  // mysql2 tra ResultSetHeader; `affectedRows` dem hang KHOP (khong phai hang
  // doi gia tri) vi mysql2 mac dinh bat co FOUND_ROWS - ghi lai dung gia tri
  // cu van la 1, khong bi bao nham.
  const matched = Number(result?.affectedRows ?? result?.[0]?.affectedRows);
  if (matched !== 1) {
    throw new Error(
      `Ghi ${column} cho user ${userId} khop ${matched} hang (phai la 1)`,
    );
  }
}
