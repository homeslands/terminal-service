/**
 * Tham chieu DON HANG dang chuoi, co tien to ten service (buoc 2.11 — nhom 2C).
 *
 * ## Vi sao can no
 *
 * Bon bang vi roi `terminal` o giai doan 8 (muc 1.9). Sau khi chuyen, khoa ngoai
 * duy nhat di nguoc - `accumulated_point_transaction_history_tbl.order_column`
 * tro sang `order_tbl` - khong con la khoa ngoai duoc nua, no thanh **tham
 * chieu mem** `terminal:<orderSlug>` (muc 1.9 diem 3). Va vi so cai dat
 * `shared-user` phuc vu NHIEU service, mot `orderSlug` tran khong du: hai
 * service co the sinh cung mot slug.
 *
 * ## Vi sao dung o buoc 2.11, khi CHUA AI GOI
 *
 * Buoc 2.15 doi chu ky bon ham diem sang nhan tham chieu, buoc 5.5 dung chung
 * tien to nay cho khoa idempotent (`terminal:giftcard:<slug>`,
 * `terminal:cardorder:<slug>:<sharedUserId>`, `terminal:<orderSlug>:debit|…`), va 7.4
 * doi dich ghi so cai. Ba dot do phai sinh/boc tien to **giong nhau tung chu**;
 * dung mot lan o day thi khong phai nghi lai ba lan.
 */

/**
 * Tien to cua service nay trong moi tham chieu mem.
 *
 * CO Y khai doc lap voi `INTERNAL_SERVICE_NAME` (`common/constants/
 * internal-api.constant.ts`) du hom nay hai hang cung gia tri `'terminal'`: cai
 * kia la **danh tinh goi noi bo** (header HMAC), cai nay la **du lieu DA GHI
 * vao so cai**. Noi chung lai thi mot lan doi ten header se lang le doi y
 * nghia cua moi hang lich su trong `accumulated_point_transaction_history_tbl`
 * — mot thu khong the migrate lui.
 */
export const SERVICE_PREFIX = 'terminal';

/** Dau phan cach. Slug sinh tu dong khong chua ky tu nay. */
const REF_SEPARATOR = ':';

/**
 * Sinh tham chieu don hang: `terminal:<orderSlug>`.
 *
 * Nhan **slug**, khong nhan `order.id`: id la khoa CUC BO cua `terminal_db`, con
 * tham chieu nay song o `shared_user_db` sau 7.4 — noi id cua `terminal` khong co
 * nghia gi. Day cung la ly do buoc 2.15 phai soi tung cho goi xem co `slug`
 * trong tay chua, vi vai cho chi cam `order.id`.
 */
export function orderRef(orderSlug: string): string {
  if (!orderSlug) {
    throw new Error(
      `orderRef: orderSlug is empty or undefined. A bare "${SERVICE_PREFIX}${REF_SEPARATOR}" ` +
        `reference would write a ledger row that resolves to no order. ` +
        `A call site holding only order.id must look the slug up first.`,
    );
  }
  return `${SERVICE_PREFIX}${REF_SEPARATOR}${orderSlug}`;
}

export interface ParsedOrderRef {
  /**
   * Ten service trong tien to, hoac `null` khi chuoi KHONG co tien to nao biet
   * duoc (hang lich su ghi `order.id` tran, truoc 2.15).
   */
  service: string | null;
  /** Phan con lai sau tien to; la ca chuoi khi khong co tien to. */
  orderSlug: string;
}

/**
 * Boc tham chieu don hang.
 *
 * ⚠ **KHONG tu quyet dinh gi khi tien to la cua service KHAC.** Tra ve
 * `service` de ben goi tu chot. Ly do: bon ham diem o 2.15 tra don theo
 * `order: { slug }` tren `terminal_db`; mot ref cua `trend` se khong khop hang
 * nao va `handleCancelReservation` thi **`return` em** khi khong tim thay
 * reservation. Tuc neu ham nay im lang tra `orderSlug` cua service khac, loi
 * se bien thanh "khong lam gi ca" — dung hinh dang hong lang le ma ke hoach
 * goi la nguon loi so mot cua buoc 2.15. Ben goi phai so
 * `parsed.service !== SERVICE_PREFIX` va xu ly tuong minh.
 *
 * ⚠ Chi dung cho dau ra cua `orderRef()`. Khoa idempotent cua buoc 5.5 co
 * them hau to (`terminal:<orderSlug>:debit`) nen khong boc bang ham nay.
 */
export function parseOrderRef(ref: string): ParsedOrderRef {
  if (!ref) {
    throw new Error(
      `parseOrderRef: ref is empty or undefined - nothing to parse.`,
    );
  }

  const at = ref.indexOf(REF_SEPARATOR);
  if (at <= 0) {
    // Khong co tien to: hang lich su (truoc 2.15) ghi khoa tran.
    return { service: null, orderSlug: ref };
  }

  return { service: ref.slice(0, at), orderSlug: ref.slice(at + 1) };
}
