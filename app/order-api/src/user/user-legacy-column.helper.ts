import { EntityManager } from 'typeorm';
import { User } from './user.entity';

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
 *
 * Buoc 8.8: entity `User` bo ca muoi cot identity => them nhom
 * `LocalIdentity` ben duoi (9 cot script / retire con dung; `language`
 * khong ai doc).
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

/**
 * Buoc 8.8 - chin cot identity CUC BO ma entity `User` da bo, theo ten field
 * logic. Chi script backfill va `user-retire.helper.ts` con dung (doc de
 * so khop / nhap sang `shared-user`, ghi khi retire / attach). 8.9 doi ten
 * chung thanh `_deprecated_*` => luon do ten qua `resolveUserColumn`.
 */
export const USER_IDENTITY_COLUMNS = {
  phonenumber: 'phonenumber_column',
  password: 'password_column',
  firstName: 'first_name_column',
  lastName: 'last_name_column',
  email: 'email_column',
  dob: 'dob_column',
  dobDM: 'dob_day_month',
  address: 'address_column',
  image: 'image_column',
} as const;

export type LocalIdentityField = keyof typeof USER_IDENTITY_COLUMNS;
export type LocalIdentity = { [K in LocalIdentityField]: string | null };
/** Hang `user_tbl` kem identity cuc bo doc bang SQL tho - kieu cua script. */
export type LegacyUser = User & LocalIdentity;

const IDENTITY_FIELDS = Object.keys(
  USER_IDENTITY_COLUMNS,
) as LocalIdentityField[];

const emptyIdentity = (): LocalIdentity =>
  Object.fromEntries(IDENTITY_FIELDS.map((f) => [f, null])) as LocalIdentity;

/** Gia tri identity cuc bo dang nam tren object (de ghi nguoc xuong DB). */
export const identityOf = (user: LegacyUser): LocalIdentity =>
  Object.fromEntries(
    IDENTITY_FIELDS.map((f) => [f, user[f] ?? null]),
  ) as LocalIdentity;

async function resolveIdentityColumns(
  manager: EntityManager,
): Promise<Record<LocalIdentityField, string>> {
  const out = {} as Record<LocalIdentityField, string>;
  for (const field of IDENTITY_FIELDS) {
    out[field] = await resolveUserColumn(manager, USER_IDENTITY_COLUMNS[field]);
  }
  return out;
}

/**
 * Identity cuc bo cua moi hang `user_tbl` (hoac cua mot hang), theo
 * `id_column`. Gia tri `null` giu nguyen - KHONG thay mac dinh.
 */
export async function readLocalIdentity(
  manager: EntityManager,
  userId?: string,
): Promise<Map<string, LocalIdentity>> {
  const columns = await resolveIdentityColumns(manager);
  const select = IDENTITY_FIELDS.map(
    (f) => `\`${columns[f]}\` AS \`${f}\``,
  ).join(', ');
  const rows: Array<Record<string, unknown>> = await manager.query(
    `SELECT \`id_column\` AS id, ${select} FROM \`${USER_TABLE}\`` +
      (userId ? ' WHERE `id_column` = ?' : ''),
    userId ? [userId] : [],
  );
  const result = new Map<string, LocalIdentity>();
  for (const row of rows) {
    const identity = emptyIdentity();
    for (const f of IDENTITY_FIELDS) {
      const value = row[f];
      identity[f] =
        value === null || value === undefined ? null : String(value);
    }
    result.set(String(row.id), identity);
  }
  return result;
}

/** Nhu `readLocalIdentity` cho MOT hang; `null` khi khong co hang do. */
export async function readLocalIdentityOf(
  manager: EntityManager,
  userId: string,
): Promise<LocalIdentity | null> {
  return (await readLocalIdentity(manager, userId)).get(userId) ?? null;
}

/** Gan identity cuc bo (doc MOT lan cho ca lo) vao cac hang vua `find`. */
export async function withLocalIdentity(
  manager: EntityManager,
  users: User[],
): Promise<LegacyUser[]> {
  const identities = await readLocalIdentity(manager);
  return users.map((user) =>
    Object.assign(user, identities.get(user.id) ?? emptyIdentity()),
  );
}

/**
 * Ghi cac cot identity cuc bo cua MOT hang. Nem loi neu khong khop dung mot
 * hang (nhu `writeLocalIsActive`).
 */
export async function writeLocalIdentity(
  manager: EntityManager,
  userId: string,
  values: Partial<LocalIdentity>,
): Promise<void> {
  const fields = IDENTITY_FIELDS.filter((f) => f in values);
  if (fields.length === 0) return;
  const columns = await resolveIdentityColumns(manager);
  const result = await manager.query(
    `UPDATE \`${USER_TABLE}\` SET ${fields
      .map((f) => `\`${columns[f]}\` = ?`)
      .join(', ')} WHERE \`id_column\` = ?`,
    [...fields.map((f) => values[f] ?? null), userId],
  );
  const matched = Number(result?.affectedRows ?? result?.[0]?.affectedRows);
  if (matched !== 1) {
    throw new Error(
      `Ghi identity cuc bo cho user ${userId} khop ${matched} hang (phai la 1)`,
    );
  }
}

/**
 * `manager.save(User, user)` roi ghi nguoc identity cuc bo dang nam tren
 * object - thay cho `save` truoc 8.8 (khi entity con giu chin cot nay).
 */
export async function saveLegacyUser(
  manager: EntityManager,
  user: LegacyUser,
): Promise<User> {
  const saved = await manager.save(User, user);
  await writeLocalIdentity(manager, user.id, identityOf(user));
  return saved;
}
