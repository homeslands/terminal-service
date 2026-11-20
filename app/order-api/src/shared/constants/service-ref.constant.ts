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

import { Logger } from '@nestjs/common';
import { OrderException } from 'src/order/order.exception';
import { OrderValidation } from 'src/order/order.validation';

/**
 * ## Vi sao hai ham duoi nem `OrderException` chu khong `Error` tran
 *
 * Doi 11/11/2026. Ban dau chung nem `new Error(...)`. Bai hoc do duoc o buoc
 * 2.13: hai service **khong co filter catch-all** (`HttpExceptionFilter` khai
 * `@Catch(HttpException)`, khong interceptor nao co `catchError`), nen mot
 * `Error` tran roi vao `ExceptionsHandler` mac dinh cua Nest va thanh
 * **500 khong ma loi**, body con khong theo khuon `AppExceptionResponseDto`.
 *
 * Ma dung la **`OrderValidation.INVALID_ORDER_SLUG` (1010014, "Invalid order
 * slug")** - ma **da co san**, khong dat moi. Ba ly do:
 *
 * 1. Dung nghia: thu khong hop le o day la **khoa don hang** trong tham chieu.
 * 2. **Ca hai UI da dich san** (`toast.invalidOrderSlug` -> "Mã đơn hàng không
 *    hợp lệ"), da kiem `locales/{vi,en}/toast.json` cua ca `trend-ui` lan
 *    `terminal-ui`. Dat ma moi thi phai sua ca hai UI cho mot duong **khach
 *    khong goi toi duoc** - xem diem 3.
 * 3. Day la **loi lap trinh, khong phai loi khach gui**: khach khong gui duoc
 *    tham chieu (hai route client-facing nhan `slug` tu `@Param`, controller
 *    chuyen thang cho service), va `orderRef` chi duoc goi voi `order.slug`
 *    cua mot hang vua tra. Vi vay cau chan doan di xuong **`logger.error`** de
 *    con duong lan ra, con body tra ve giu nguyen cau mac dinh cua bang ma -
 *    dung khuon `assertUserKeyLoaded` (`user/user.constant.ts`).
 *
 * Khong co vong import: `order.validation` chi keo `app/app.validation`, va
 * khong tep `*.validation.ts`/`*.exception.ts` nao import lai tep nay (da
 * grep). Khong tep `*.validation.ts` nao doc `process.env` nen viec keo chung
 * vao som hon trong do thi import khong doi hanh vi nao.
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
  const context = 'service-ref.constant.orderRef';

  if (!orderSlug) {
    new Logger(context).error(
      `${context}: orderSlug is empty or undefined (value ${JSON.stringify(orderSlug)}). ` +
        `A bare "${SERVICE_PREFIX}${REF_SEPARATOR}" reference would write a ledger row that ` +
        `resolves to no order. A call site holding only order.id must look the slug up first - ` +
        `see step 2.15. Throwing 1010014 INVALID_ORDER_SLUG.`,
    );
    throw new OrderException(OrderValidation.INVALID_ORDER_SLUG);
  }

  if (orderSlug.includes(REF_SEPARATOR)) {
    // Mot slug KHONG chua dau phan cach. Chuoi co dau phan cach o day gan nhu
    // chac chan la mot tham chieu DA boc roi (`terminal:abc`) bi boc lan thu hai,
    // hoac mot khoa idempotent cua buoc 5.5 (`terminal:abc:debit`). Ca hai se
    // sinh ra `terminal:terminal:abc` - mot tham chieu khong tra ra don nao.
    new Logger(context).error(
      `${context}: orderSlug "${orderSlug}" already contains "${REF_SEPARATOR}". ` +
        `A slug never does. This is either a reference being wrapped twice, or a step-5.5 ` +
        `idempotency key passed in by mistake. Throwing 1010014 INVALID_ORDER_SLUG.`,
    );
    throw new OrderException(OrderValidation.INVALID_ORDER_SLUG);
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
 * `order: { slug }` tren `terminal_db`; mot ref cua `terminal` se khong khop hang
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
  const context = 'service-ref.constant.parseOrderRef';

  if (!ref) {
    new Logger(context).error(
      `${context}: ref is empty or undefined (value ${JSON.stringify(ref)}) - nothing to parse. ` +
        `No client can send a reference: the two client-facing routes take \`slug\` from ` +
        `@Param and the controller hands it straight to the service, so this is a bug in the ` +
        `calling code. Throwing 1010014 INVALID_ORDER_SLUG.`,
    );
    throw new OrderException(OrderValidation.INVALID_ORDER_SLUG);
  }

  const at = ref.indexOf(REF_SEPARATOR);
  if (at <= 0) {
    // Khong co tien to nhan ra duoc: hang lich su (truoc 2.15) ghi khoa tran.
    //
    // KHONG nem o day - do la hop dong co y cua ham nay: tra `service: null`
    // ra cho BEN GOI chot. Ben goi (`assertLocalOrderRef` trong
    // `accumulated-point.service.ts`) so `service !== SERVICE_PREFIX` roi nem,
    // nen duong nay van hong ON AO, khong im lang.
    //
    // `at === 0` (ref bat dau bang dau phan cach, vd ":abc") cung roi vao day:
    // `SERVICE_PREFIX` khong bao gio rong nen `orderRef()` khong sinh duoc
    // chuoi nhu vay, va `service: null` lam ben goi tu chen no.
    return { service: null, orderSlug: ref };
  }

  const orderSlug = ref.slice(at + 1);

  // Hai hinh dang hong ma ban truoc tra ve IM LANG, va chung di qua duoc ca
  // phep gac tien to vi `service` khop:
  //
  //   `terminal:`          -> { service: 'terminal', orderSlug: '' }
  //   `terminal:abc:debit` -> { service: 'terminal', orderSlug: 'abc:debit' }
  //
  // Ca hai roi vao `findOne({ where: { slug } })` khong khop hang nao, va
  // `handleCancelReservation` thi **`return` em** khi khong thay reservation
  // ⇒ loi thanh "khong lam gi ca": giu cho diem khong bao gio duoc nha. Dung
  // hinh dang hong lang le ma ke hoach goi la nguon loi so mot cua buoc 2.15.
  if (!orderSlug) {
    new Logger(context).error(
      `${context}: ref "${ref}" has the prefix but no slug after it. ` +
        `Throwing 1010014 INVALID_ORDER_SLUG instead of looking up an empty slug that ` +
        `cannot match and returning silently.`,
    );
    throw new OrderException(OrderValidation.INVALID_ORDER_SLUG);
  }

  if (orderSlug.includes(REF_SEPARATOR)) {
    // Buoc 5.5 dung khoa idempotent co HAU TO (`terminal:<orderSlug>:debit`).
    // Chu thich cua ham nay van noi "chi dung cho dau ra cua `orderRef()`" -
    // nay co phep gac that, khong con chi la mot cau nhac.
    new Logger(context).error(
      `${context}: ref "${ref}" has more than one "${REF_SEPARATOR}". This function only ` +
        `parses orderRef() output; a step-5.5 idempotency key such as ` +
        `"${SERVICE_PREFIX}${REF_SEPARATOR}<orderSlug>${REF_SEPARATOR}debit" must NOT be parsed ` +
        `with it. Throwing 1010014 INVALID_ORDER_SLUG.`,
    );
    throw new OrderException(OrderValidation.INVALID_ORDER_SLUG);
  }

  return { service: ref.slice(0, at), orderSlug };
}
// ---------------------------------------------------------------------------
// Buoc 5.5 — khoa idempotent cho lenh ghi vi. GHI SAN, CHUA GUI DI DAU: so cai
// con o `terminal_db`, 7.7 moi doi dich ghi sang vi o shared-user
// va gui kem khoa nay. Moi cho se gui da danh dau comment "Buoc 5.5".
//
// Cau hoi da ra cho TUNG khoa: "mot `<ref>` co the sinh ra NHIEU HON MOT lenh
// ghi khong?" - neu co, vi se nuot lenh thu hai nhu mot lan goi lap (mat xu,
// im lang). Tra loi o tung ham.
// ---------------------------------------------------------------------------

/** Nam thao tac vi cua mot don hang - moi thao tac toi da MOT lenh ghi/don. */
export const ORDER_WALLET_OPS = [
  'debit',
  'reserve',
  'confirm',
  'add',
  'cancel',
] as const;
export type OrderWalletOp = (typeof ORDER_WALLET_OPS)[number];

// Kiem tung phan cua khoa. Khoa viet bang template literal (khong `join`) de
// grep `:giftcard:` / `:cardorder:` ra dung hinh dang khoa.
const assertKeyParts = (...parts: string[]): void => {
  const context = 'service-ref.constant.assertKeyParts';
  const bad = parts.find((p) => !p || p.includes(REF_SEPARATOR));
  if (bad !== undefined) {
    // Phan rong hoac chua dau phan cach ⇒ hai lenh khac nhau co the trung
    // khoa (vd slug rong cua hai don) ⇒ vi nuot lenh sau. Hong ON AO.
    new Logger(context).error(
      `${context}: key part ${JSON.stringify(bad)} is empty or contains "${REF_SEPARATOR}" ` +
        `(parts ${JSON.stringify(parts)}). Throwing 1010014 INVALID_ORDER_SLUG.`,
    );
    throw new OrderException(OrderValidation.INVALID_ORDER_SLUG);
  }
};

/**
 * `terminal:cardorder:<cardOrderSlug>:<sharedUserId>` - mot lan cong xu cua don
 * the cho MOT nguoi.
 *
 * Bat buoc kem `sharedUserId` NGUOI DUOC CONG (Z-2): nhanh GIFT cong N lan cho
 * N nguoi nhan trong vong lap cua `_generateAndRedeem`; dung chung
 * `terminal:cardorder:<slug>` thi nguoi nhan thu 2..N bi vi nuot nhu goi lap.
 * Mot don + mot nguoi = dung mot lenh cong (SELF: chu don; GIFT: tung nguoi
 * nhan - mot nguoi nhan chi co mot dong `recipient` moi don).
 */
export function cardOrderIdempotencyKey(
  cardOrderSlug: string,
  sharedUserId: string,
): string {
  assertKeyParts(cardOrderSlug, sharedUserId);
  return `${SERVICE_PREFIX}:cardorder:${cardOrderSlug}:${sharedUserId}`;
}

/**
 * `terminal:giftcard:<giftCardSlug>` - mot the qua chi cong xu MOT lan (cho mot
 * nguoi dung). Mot `<ref>` = mot lenh: the da USED thi `redeem` tu choi.
 */
export function giftCardIdempotencyKey(giftCardSlug: string): string {
  assertKeyParts(giftCardSlug);
  return `${SERVICE_PREFIX}:giftcard:${giftCardSlug}`;
}

/**
 * `terminal:<orderSlug>:debit|confirm|add` va
 * `terminal:<orderSlug>:reserve|cancel:<reservationSeq>` - thao tac vi cua mot
 * don hang. Khac `orderRef()` (tham chieu mem, KHONG co hau to) -
 * `parseOrderRef` tu choi chuoi nay.
 *
 * - `debit` (tra don bang xu), `confirm` (xac nhan diem da giu), `add` (cong
 *   diem tich luy): MOT lenh moi don - don chi thanh toan mot lan; goi lai
 *   (job thu lai) PHAI bi vi nuot.
 * - `reserve`, `cancel`: KHONG phai mot lenh moi don. `reservePointsForOrder`
 *   gap don da co giu diem PENDING thi huy mem ban cu roi tao RESERVE moi cho
 *   CUNG don (doi so diem dung, hoac giu → huy → giu lai). Khoa chi theo don
 *   thi lan giu thu hai (va lan huy thu hai) bi vi nuot nhu goi lap - cung loai
 *   loi Z-2. Nen bat buoc kem `reservationSeq`: lan giu diem thu may cua don
 *   (1, 2, …); `cancel` mang so cua lan giu ma no huy. (Lech chu ke hoach 5.5,
 *   ghi 16/11/2026; 7.7 chot nguon cua so nay.)
 */
export function orderOpIdempotencyKey(
  orderSlug: string,
  op: Exclude<OrderWalletOp, 'reserve' | 'cancel'>,
): string;
export function orderOpIdempotencyKey(
  orderSlug: string,
  op: Extract<OrderWalletOp, 'reserve' | 'cancel'>,
  reservationSeq: number,
): string;
export function orderOpIdempotencyKey(
  orderSlug: string,
  op: OrderWalletOp,
  reservationSeq?: number,
): string {
  const perReservation = op === 'reserve' || op === 'cancel';
  if (
    perReservation !== (Number.isInteger(reservationSeq) && reservationSeq > 0)
  ) {
    const context = 'service-ref.constant.orderOpIdempotencyKey';
    new Logger(context).error(
      `${context}: op "${op}" with reservationSeq ${JSON.stringify(reservationSeq)} - ` +
        `reserve/cancel need a positive integer, the other ops take none. ` +
        `Throwing 1010014 INVALID_ORDER_SLUG.`,
    );
    throw new OrderException(OrderValidation.INVALID_ORDER_SLUG);
  }
  assertKeyParts(orderSlug);
  return perReservation
    ? `${SERVICE_PREFIX}:${orderSlug}:${op}:${reservationSeq}`
    : `${SERVICE_PREFIX}:${orderSlug}:${op}`;
}
