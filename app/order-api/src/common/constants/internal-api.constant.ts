// Gioi han cua cac route /internal/* - PHAI GIU GIONG HET ben shared-user
// (shared-user/src/common/constants/internal-api.constant.ts). Ben goi (file
// nay) tu chia lo theo dung hang so nay; ben nhan tu choi (400) khi vuot -
// KHONG cat bot im lang, vi cat im lang la mat nguoi trong danh sach ma
// khong ai biet.

// QD21 - POST /internal/users/list-recent. Luoi rong quet cua so 48 gio,
// co the la vai nghin hang sau mot dot su co => phan trang la BAT BUOC.
export const INTERNAL_LIST_RECENT_PAGE_SIZE = 200;

// Chan tren so trang mot lan quet duoc lap - de mot loi phia shared-user
// (vd luon tra du `limit` dong) khong bien job thanh vong lap vo tan.
export const INTERNAL_LIST_RECENT_MAX_PAGES = 100;

// Ten service nay tu khai khi goi sang shared-user. QD18: shared-user ghi
// gia tri nay vao owner_service khi `isShared: false`, va no lay tu HEADER
// chu khong phai tu body - de mot service khong khai duoc hang thuoc ve
// service khac.
//
// Header KHONG nam trong chu ky HMAC: hom nay hai ben dung CHUNG mot
// `INTERNAL_API_SECRET` nen mot service da co secret thi ky duoc bat ky noi
// dung nao - dua header vao chu ky cung khong chong duoc gia danh. Khi moi
// service co secret rieng thi danh tinh moi that su xac thuc duoc.
export const INTERNAL_SERVICE_HEADER = 'x-internal-service';
export const INTERNAL_SERVICE_NAME = 'terminal';
