import { randomBytes, randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import { User } from './user.entity';

/**
 * RETIRE mot hang `user_tbl` cua terminal - dung cho luot backfill
 * `scripts/backfill-shared-user-ids.ts` (progress/terminal-api.md, "Nguon du
 * lieu khach hang").
 *
 * Retire = lam y nhu `deleteAccount`: SDT doi sang chuoi rac, xoa sach
 * identity, khoa. KHONG xoa hang: hang con bi ~12 bang tham chieu bang khoa
 * ngoai NO ACTION (order, work_shift, balance, voucher...) - xoa la bi DB chan
 * hoac mat lich su nghiep vu.
 *
 * Khac `deleteAccount` o ba cho, ca ba deu de lan chay nay dao nguoc va chay
 * lai duoc:
 * - SDT/email rac mang TIEN TO `retired-`: phan biet "bi retire boi lan chay
 *   nay" voi "da inactive tu truoc" (hai thu ma `isActive=false` tron lam mot).
 * - `sharedUserId` cung doi sang uuid ngau nhien: neu giu placeholder cu, no
 *   co the trung id that cua mot nguoi khac ben shared-user va `ensureLocalUser`
 *   se tra nham hang nay cho nguoi do.
 * - Gia tri cu duoc chep vao `user_retire_backup_tbl` TRUOC khi ghi de.
 */

export const RETIRED_PREFIX = 'retired-';
// `.invalid` la TLD danh rieng (RFC 2606) - thu gui toi khong bao gio di dau.
const RETIRED_EMAIL_DOMAIN = 'retired.invalid';

export const generateRetiredPhonenumber = (): string =>
  `${RETIRED_PREFIX}${randomBytes(8).toString('hex')}`;

export const generateRetiredEmail = (): string =>
  `${RETIRED_PREFIX}${randomBytes(16).toString('hex')}@${RETIRED_EMAIL_DOMAIN}`;

export const isRetiredPhonenumber = (phonenumber?: string | null): boolean =>
  !!phonenumber && phonenumber.startsWith(RETIRED_PREFIX);

export type UserBackupAction =
  | 'RETIRE'
  | 'RENAME_ROOT'
  | 'DETACH'
  | 'ATTACH'
  | 'IMPORT_EMAIL';

export interface UserBackupMeta {
  runId: string;
  action: UserBackupAction;
  reason: string;
}

// Chep gia tri HIEN TAI cua `user` vao bang sao luu. Goi TRUOC moi lenh ghi de
// identity, trong cung `manager` (cung transaction) voi lenh ghi do.
export async function backupUser(
  manager: EntityManager,
  user: User,
  meta: UserBackupMeta,
): Promise<void> {
  await manager.query(
    `INSERT INTO \`user_retire_backup_tbl\` (
      \`id_column\`, \`run_id_column\`, \`action_column\`, \`reason_column\`,
      \`user_id_column\`, \`user_slug_column\`, \`role_column\`,
      \`old_phonenumber_column\`, \`old_shared_user_id_column\`,
      \`old_first_name_column\`, \`old_last_name_column\`, \`old_email_column\`,
      \`old_dob_column\`, \`old_dob_day_month_column\`, \`old_address_column\`,
      \`old_image_column\`, \`old_is_active_column\`
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      meta.runId,
      meta.action,
      meta.reason.slice(0, 255),
      user.id,
      user.slug ?? null,
      user.role?.name ?? null,
      user.phonenumber ?? null,
      user.sharedUserId ?? null,
      user.firstName ?? null,
      user.lastName ?? null,
      user.email ?? null,
      user.dob ?? null,
      user.dobDM ?? null,
      user.address ?? null,
      user.image ?? null,
      user.isActive === undefined || user.isActive === null
        ? null
        : user.isActive
          ? 1
          : 0,
    ],
  );
}

/**
 * Retire `user` trong mot transaction: sao luu roi ghi de. Tra ve hang da
 * retire. Chay lai tren hang da retire thi chi doi sang mot chuoi rac khac -
 * vo hai, nhung ben goi nen loc `isRetiredPhonenumber` truoc de khong ghi
 * thua mot dong sao luu.
 */
export async function retireLocalUser(
  manager: EntityManager,
  user: User,
  meta: Omit<UserBackupMeta, 'action'>,
): Promise<User> {
  return manager.transaction(async (tx) => {
    await backupUser(tx, user, { ...meta, action: 'RETIRE' });
    Object.assign(user, {
      phonenumber: generateRetiredPhonenumber(),
      sharedUserId: randomUUID(),
      firstName: null,
      lastName: null,
      dob: null,
      dobDM: null,
      email: null,
      address: null,
      image: null,
      isActive: false,
    });
    return tx.save(User, user);
  });
}
