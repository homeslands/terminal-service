import { config as dotenvConfig } from 'dotenv';

// Nap `.env` NGAY TAI DAY, khong trong cho `config/database.config.ts`: tep
// hang so nay duoc evaluate rat som trong do thi import va co the chay TRUOC
// tep do. Doc `process.env` khi dotenv chua chay thi bien bi bo qua LANG LE -
// nhin tuong da cau hinh ma that ra dang dung gia tri mac dinh.
//
// Goi lai dotenv la an toan: no KHONG ghi de bien da co san, nen bien that cua
// moi truong (Docker/K8s/CI) van thang gia tri trong `.env`.
dotenvConfig({ path: '.env' });

export enum UserLanguage {
  VI = 'vi',
  EN = 'en',
}

export enum UserRequirementKey {
  NEED_UPDATE_PASSWORD = 'NEED-UPDATE-PASSWORD',
  NEED_UPDATE_PHONE_NUMBER = 'NEED-UPDATE-PHONE-NUMBER',
}

export enum UserRequirementLevel {
  WARNING = 'warning',
  BLOCK = 'block',
}

export enum UserRequirementStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
}

export enum UserRequirementScope {
  INITIAL = 'initial', // level: block
  PERIODIC = 'periodic', // level: warning
}

// ===========================================================================
// QD19 lop 1 - sync-on-read trong UserService.getAllUsers
// ===========================================================================

// Cua so keo user moi tu shared-user ve. 15 phut la CO Y lon hon chu ky 10
// phut cua luoi nhanh (lop 3) - chong lan de khong roi nguoi o bien giua hai
// co che.
export const SYNC_RECENT_USERS_WINDOW_MINUTES = 15;

// Throttle cho TOAN CUM, khong phai cho tung tien trinh. O tim khach co
// debounce: go mot so dien thoai van ra 3-5 luot goi, nhan voi nhieu may o
// quay gio cao diem. Mot luot/60 giay la du - cua so 15 phut van thua suc
// phu khe con lai.
//
// Khoa nay RIENG, khong dung chung voi Redlock cua cron (QD21): dung chung
// thi hai co che doc lap thanh phu thuoc nhau, va dung luc can bu nhat (sau
// su co) lai bi khoa.
export const SYNC_RECENT_USERS_THROTTLE_KEY = 'sync-recent-users:last-run';
export const SYNC_RECENT_USERS_THROTTLE_SECONDS = 60;

// Day la duong NONG (nguoi dung dang cho go), khong phai lenh goi nen -
// timeout mac dinh 5 giay cua client la qua dai o day.
export const SYNC_RECENT_USERS_TIMEOUT_MS = 2000;

// ===========================================================================
// QD19 lop 1b - tra DUNG SDT khi tim cuc bo ra rong (UserService.getAllUsers)
// ===========================================================================

// Chi tra sang shared-user khi nhan vien da go DU mot so di dong (10 chu so,
// bat dau bang 0) - cung quy uoc "du so" voi o chon nguoi nhan the qua o UI.
// Go do dang (`LIKE %...%`) KHONG bao gio kich hoat: khop tuyet doi mot so day
// du thi khong de ra hang rac khi go nham, dung dieu sync-on-read muon tranh.
export const LOOKUP_ON_MISS_PHONENUMBER_PATTERN = /^0\d{9}$/;

// Van la duong NONG (nhan vien dang cho o quay) - cung tran 2 giay voi
// sync-on-read, khong phai 5 giay mac dinh cua client.
export const LOOKUP_ON_MISS_TIMEOUT_MS = 2000;

// ===========================================================================
// QD19 lop 3 + QD21 - hai luoi dinh ky (UserScheduler)
// ===========================================================================

// Luoi nhanh chay moi 10 phut nhung quet cua so 30 phut: chong lan 3 lan la
// CO Y, de khong roi nguoi o dung bien cua so (do tre dong ho, giao dich
// commit cham).
export const SYNC_USERS_FAST_GRID_WINDOW_MINUTES = 30;

// Luoi rong chay 1 lan/ngay. Cua so phai RONG HON khoang chet te nhat minh
// chap nhan duoc - 48 gio thi song sot qua mot ngay sap tron ven. Cua so cu
// ("ca ngay hom qua") khong bao gom nguoi tao trong chinh ngay hom nay, nen
// tre thuc te la 2,5 gio -> 26 gio.
export const SYNC_USERS_WIDE_GRID_WINDOW_HOURS = 48;

// ===========================================================================
// 2B2 - nhan dien khach vang lai (buoc 2.6)
// ===========================================================================

// Hang sentinel `default-customer` DUNG CHUNG giua terminal, trend va
// shared-user: `shared_user_db` giu dung mot hang, con moi DB cuc bo mot hang
// tro vao no. Gia tri nay dung cho ca terminal vi hang sentinel cuc bo mang
// cung `id_column` (`v4.0.0-01` gan `shared_user_id_column = id_column`).
//
// Doc tu bien moi truong, co MAC DINH la gia tri cua cum hien tai (ba DB local
// deu mang dung id nay - do lai 02/11/2026).
//
// Ban va 02/11/2026 - vi sao doi so voi ghi chu cu "CO Y khong dua vao .env":
// ghi chu cu so env lech giua hai service thi mot ben coi hang do la khach vang
// lai, ben kia coi la nguoi that. Dieu do dung, NHUNG hang so hard-code cung co
// y het failure mode ay, chi khac dieu kien: hang so doi DU LIEU phai khop MA,
// env doi ENV phai khop DU LIEU. Ca hai deu hong lang le.
//
// Khac biet that: hang sentinel dang chay DUOC TAO boi `initDefaultCustomer`
// (da xoa o buoc 2.9) bang UUID NGAU NHIEN, nen mot moi truong khong di len tu
// ban mono se mang id khac. Sua bang env la mot dong cau hinh; sua bang cach ep
// id o `shared-user` la doi KHOA CHINH cua mot hang co 18 khoa ngoai tro vao.
// Tu buoc 2.10, moi truong dung MOI lay hang sentinel tu migration (id co dinh
// = gia tri mac dinh duoi day), nen env chi con can o moi truong CU co id lech.
//
// BA service phai khai CUNG mot gia tri - xem ghi chu o buoc 2.6 cua ke hoach.
//
// `|| mac dinh` chu khong `??`: bien khai rong (`DEFAULT_CUSTOMER_SHARED_ID=`)
// phai roi ve mac dinh, khong duoc thanh chuoi rong.
export const DEFAULT_CUSTOMER_SHARED_ID =
  process.env.DEFAULT_CUSTOMER_SHARED_ID?.trim() ||
  '3c85fc13-2887-45c1-bd4e-4fece5387d9f';

// Tu buoc 2.9 chi con DUNG MOT cho dung SDT cua sentinel:
// `scripts/backfill-shared-user-ids.ts` (doi chieu hai DB theo SDT - script
// chay TRUOC khi co `sharedUserId`, nen no khong the doc theo khoa moi).
// Nguoi doc thu hai, `user.scheduler.ts` (`initDefaultCustomer`), da bi xoa
// o 2.9.
//
// Hang VAN O LAI du chi con mot nguoi doc, va o day thay vi o
// `accumulated-point/`: thu muc do bi xoa o giai doan 8, con script thi phai
// con chay duoc o moi truong khac.
export const DEFAULT_CUSTOMER_PHONENUMBER = 'default-customer';

/**
 * Khach vang lai hay khong - doc theo `sharedUserId`, khong theo `phonenumber`.
 *
 * Vi sao nhan BAN GHI chu khong nhan mot chuoi: `phonenumber` nam trong dien
 * se xoa khoi `user_tbl` cuc bo (dich cuoi chi con {sharedUserId, role,
 * branch}), `sharedUserId` thi o lai. Nhan ban ghi de lan sau cot kia bien mat
 * thi chi phai sua than ham nay, khong phai di sua lai tung cho goi.
 *
 * NEM LOI khi ban ghi co mat ma `sharedUserId` la `undefined`: do la dau hieu
 * nguoi goi `select` thieu cot hoac quen join quan he. Tra `false` lang le o do
 * nghia la khach vang lai bi coi la nguoi that, tren dung duong nong nhat cua
 * he thong - on ao thi hong ngay o moi truong dev.
 *
 * `null`/`undefined` (don khong co chu) tra `false`: khong co ai thi khong ai
 * la sentinel - khac han voi "co ban ghi ma khong doc duoc khoa".
 */
export function isDefaultCustomer(
  user?: { sharedUserId?: string } | null,
): boolean {
  if (!user) return false;
  if (user.sharedUserId === undefined) {
    throw new Error(
      'isDefaultCustomer: ban ghi khong mang sharedUserId (select/join thieu shared_user_id_column)',
    );
  }
  return user.sharedUserId === DEFAULT_CUSTOMER_SHARED_ID;
}

/**
 * Chot RUNTIME cho khoa `sharedUserId` (buoc 2.11 — nhom 2C, muc 1.10 he qua 3).
 *
 * ## Vi sao kieu TypeScript KHONG du
 *
 * Gia tri hay toi tu `user?.sharedUserId`, va `?.` cho ra kieu `string` chu
 * khong phai `string | undefined`. Nen ham nhan no **bien dich sach** roi nhan
 * `undefined` luc chay. Khi do:
 *
 *   `findOne({ where: { sharedUserId: undefined } })`
 *
 * TypeORM **bo han dieu kien** va tra **hang dau bang** — tuc vi/diem cua
 * mot nguoi la. Day la dung lop loi da xay ra that o buoc 2.3 (`findOneByField`
 * voi khoa rong) va 2.4 (`lookup` the voi `code: ''`).
 *
 * ## Vi sao NEM chu khong roi ve `IsNull()`
 *
 * `IsNull()` la dung cho nhung ham ma "khong co khoa nao" la **dau vao hop le**
 * — vd `findOneByField`, payload cua no co ca hai khoa tuy chon. O day nguoc
 * lai: khoa la **bat buoc**, nen `undefined` khong phai mot dau vao ma la dau
 * hieu **quan he chua nap** (thieu `relations`, hoac mot `select:` hep tay).
 * Roi ve "khop 0 hang" se bien mot loi lap trinh thanh mot ket qua rong im
 * lang; nem thi no hong ngay o moi truong dev.
 *
 * ## Bay lam moi phep kiem nhe tay bao xanh gia
 *
 * **175/723 hang** `user_tbl` co `id_column` **bang dung**
 * `shared_user_id_column` — di san cua viec hai DB tach ra tu cung mot mono.
 * Nham lan hai khoa van cho ket qua DUNG tren nhom hang do. Vi vay moi phep
 * kiem phai dung tai khoan co `id <> sharedUserId` (muc 1.10).
 *
 * @param key    gia tri khoa doc duoc (thuong la `user?.sharedUserId`)
 * @param context `TenClass.tenHam` — de log noi len tieng goi nao thieu
 * @returns chinh `key`, da chac chan khong `undefined`, de goi duoc inline
 */
export function assertUserKeyLoaded(
  key: string | undefined | null,
  context: string,
): string {
  if (key === undefined || key === null || key === '') {
    throw new Error(
      `${context}: sharedUserId is not loaded (value ${JSON.stringify(key)}). ` +
        `This is almost always an UNLOADED RELATION - a missing \`relations\` ` +
        `when fetching the \`user\` row, or a hand-narrowed \`select:\` that ` +
        `dropped shared_user_id_column. Do NOT fall back to IsNull() here: the ` +
        `key is required, and a \`where\` holding \`undefined\` is DROPPED by ` +
        `TypeORM, which then returns the FIRST ROW of the table - that is ` +
        `another person's wallet or points.`,
    );
  }
  return key;
}
