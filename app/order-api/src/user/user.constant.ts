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
