/**
 * Buoc 9.1 - doi soat vi/diem hai chieu (Z-8), luoi bu cua QD8.
 *
 * ## Ban v0 - TAM
 *
 * Doc THANG `shared_user_db` bang SQL (ten schema la tham so), chay duoc chi vi
 * `terminal_db` va `shared_user_db` dang nam CHUNG mot MySQL instance va tai khoan
 * DB cua `terminal` duoc `SELECT` tren schema kia. Hai DB tach may thi phai doi
 * sang doc qua route lo cua `shared-user` (ke hoach 9.1, TC-ST-237).
 *
 * ## Hai chieu
 *
 * - Xuoi - moi don DA CHOT (co `reference_number`, payment `completed`) trong
 *   cua so, TAO tu moc cutover tro di:
 *   - tra bang xu (`point`, so tien > 0) => phai co `terminal:<slug>:debit`;
 *   - du dieu kien cong diem (khach `CUSTOMER`, khong phai khach vang lai,
 *     so diem >= 1 theo ti le hien tai) => phai co `terminal:<slug>:add`.
 *   Cua so xet `updated_at` cua don, ma cot nay nhay moi lan don duoc luu lai
 *   (vd `tracking.scheduler` chuyen don da PAID sang SHIPPING / COMPLETED).
 *   Chi loc theo `updated_at` thi don chot bang vi cuc bo TRUOC cutover (khong
 *   co khoa debit/add) ma duoc luu lai SAU cutover lot vao cua so, du moc dat
 *   dung => bi bao MISSING_ADD va scheduler cong diem lan hai. Vi vay xet them
 *   `created_at >= since`: don tao sau moc khong the da chot bang vi cu. Gia
 *   phai tra: don tao truoc moc ma chot sau moc khong duoc kiem chieu xuoi.
 * - Nguoc - moi giao dich `terminal:*` ghi trong cua so phai tro ve mot ban ghi
 *   cua `terminal`: don (debit/add/confirm/reserve/cancel), the qua, don the,
 *   campaign. QD-T1: vi `terminal` KHONG backfill sang shared-user, nen
 *   khong co `terminal:legacy:*`; gap thi bo qua nhu ben trend.
 *
 * Ham nay CHI DOC va tra ve danh sach lech. Viec "thieu `add` thi goi lai" la
 * cua scheduler (`WalletReconcileScheduler`) - moi lech khac chi bao, khong tu
 * sua: tien tu sua la cach nhan doi loi.
 *
 * Khong import gi doc `process.env` luc nap (`DEFAULT_CUSTOMER_SHARED_ID` di
 * qua tham so) de script kich tay (`scripts/reconcile-wallet.ts`) dung chung.
 */

import { RoleEnum } from 'src/role/role.enum';
import { PaymentMethod, PaymentStatus } from 'src/payment/payment.constants';
import { calculateAccumulatedPoints } from 'src/accumulated-point/accumulated-point.utils';

/** Cua so nhin lai: job chay hang ngay, 72 gio bu duoc hai lan lo. */
export const WALLET_RECONCILE_LOOKBACK_HOURS = 72;
/** Ban ghi moi hon 30 phut de lan sau - job chot don co the dang chay do. */
export const WALLET_RECONCILE_GRACE_MINUTES = 30;

/** Chay mot cau SQL, tra mang hang (`DataSource.query` / mysql2 boc lai). */
export type WalletReconcileQuery = (
  sql: string,
  params?: unknown[],
) => Promise<Array<Record<string, unknown>>>;

export interface WalletReconcileOptions {
  /** Ten schema cua `shared-user` tren cung instance (vd `shared_user_db`). */
  sharedUserDb: string;
  /**
   * Moc cutover vi (7.8): don TRUOC moc nay di bang vi cuc bo cua `terminal`
   * (QD-T1: khong nhap sang shared-user) - KHONG co khoa debit/add, xet vao la
   * bao lech gia (va scheduler se cong diem lan hai). Chieu xuoi so moc voi
   * CA `updated_at` lan `created_at` cua don (xem dau tep).
   */
  since: Date;
  /** Cua so nhin lai, tinh theo dong ho cua MySQL (`NOW()`). */
  lookbackHours: number;
  /** Bo qua ban ghi moi hon chung nay phut - job chot don co the dang chay. */
  graceMinutes: number;
  /** Ti le tich diem hien tai (`ACCUMULATED_POINTS_PERCENTAGE`). */
  pointsPercentage: number;
  /** `sharedUserId` cua khach vang lai (khong duoc cong diem). */
  defaultCustomerSharedId: string;
  /** Tien to khoa cua service nay. */
  servicePrefix?: string;
}

export type WalletFindingKind =
  | 'MISSING_DEBIT'
  | 'MISSING_ADD'
  | 'ORPHAN_DEBIT'
  | 'ORPHAN_ADD'
  | 'ORPHAN_ORDER_OP'
  | 'ORPHAN_GIFT_CARD'
  | 'ORPHAN_CARD_ORDER'
  | 'ORPHAN_CAMPAIGN'
  | 'UNKNOWN_KEY';

export interface WalletFinding {
  kind: WalletFindingKind;
  /** Khoa giao dich (co hoac le ra phai co). */
  key: string;
  detail: string;
  /** Chi `MISSING_ADD`: du lieu de goi lai `/add` cung khoa. */
  order?: {
    id: string;
    slug: string;
    sharedUserId: string;
    points: number;
  };
}

export interface WalletReconcileReport {
  ordersChecked: number;
  keysChecked: number;
  findings: WalletFinding[];
}

const CHUNK = 500;
const SCHEMA_NAME = /^[A-Za-z0-9_$]+$/;
const ORDER_OPS = new Set(['debit', 'confirm', 'add']);
const SEQ_OPS = new Set(['reserve', 'cancel']);
const RELEASE_SUFFIX = ':release';
const RESERVATION_SUFFIXES = new Set(['confirm', 'cancel']);

type ParsedKey =
  | { family: 'legacy' }
  | { family: 'giftcard'; slug: string }
  | { family: 'cardorder'; slug: string }
  | { family: 'campaign'; slug: string }
  | { family: 'order'; slug: string; op: string; release: boolean }
  | { family: 'unknown' };

/**
 * Tach khoa theo dung hinh dang `service-ref.constant.ts` sinh ra (khong phan
 * nao rong, khong phan nao chua `:`).
 */
export function parseWalletKey(key: string, prefix: string): ParsedKey {
  const parts = key.split(':');
  if (parts[0] !== prefix || parts.some((p) => p === '')) {
    return { family: 'unknown' };
  }
  const rest = parts.slice(1);
  switch (rest[0]) {
    case 'legacy':
      return rest.length === 2 ? { family: 'legacy' } : { family: 'unknown' };
    case 'giftcard':
      return rest.length === 2
        ? { family: 'giftcard', slug: rest[1] }
        : { family: 'unknown' };
    case 'cardorder':
      return rest.length === 3
        ? { family: 'cardorder', slug: rest[1] }
        : { family: 'unknown' };
    case 'campaign':
      return rest.length === 3
        ? { family: 'campaign', slug: rest[1] }
        : { family: 'unknown' };
  }
  const [slug, op, extra, more] = rest;
  if (rest.length === 2 && ORDER_OPS.has(op)) {
    return { family: 'order', slug, op, release: false };
  }
  if (rest.length === 3 && op === 'debit' && extra === 'release') {
    return { family: 'order', slug, op, release: true };
  }
  // `<slug>:reserve:<n>` / `<slug>:cancel:<n>` (khoa terminal sinh), va hai dong
  // shared-user TU SINH tu khoa giu cho: `<khoa giu>:confirm` /
  // `<khoa giu>:cancel` (RESERVATION_*_SUFFIX, ke ca huy do het han).
  if (
    SEQ_OPS.has(op) &&
    /^[1-9]\d*$/.test(extra) &&
    (rest.length === 3 ||
      (op === 'reserve' && rest.length === 4 && RESERVATION_SUFFIXES.has(more)))
  ) {
    return { family: 'order', slug, op, release: false };
  }
  return { family: 'unknown' };
}

const chunks = <T>(items: T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) {
    out.push(items.slice(i, i + CHUNK));
  }
  return out;
};

const placeholders = (n: number) => new Array(n).fill('?').join(', ');

/** Cac gia tri cua `column` trong `table` thuoc `values` (chia lo). */
async function existing(
  query: WalletReconcileQuery,
  table: string,
  column: string,
  values: string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  for (const part of chunks([...new Set(values)])) {
    const rows = await query(
      `SELECT ${column} AS v FROM ${table} WHERE ${column} IN (${placeholders(part.length)})`,
      part,
    );
    rows.forEach((row) => found.add(String(row.v)));
  }
  return found;
}

interface OrderRow {
  id: string;
  slug: string;
  subtotal: number;
  deliveryFee: number;
  method: string | null;
  amount: number;
  sharedUserId: string | null;
  role: string | null;
}

interface OrderState {
  finalized: boolean;
  method: string | null;
}

export async function reconcileWallet(
  query: WalletReconcileQuery,
  options: WalletReconcileOptions,
): Promise<WalletReconcileReport> {
  if (!SCHEMA_NAME.test(options.sharedUserDb)) {
    throw new Error(
      `reconcileWallet: invalid shared-user schema name ${JSON.stringify(options.sharedUserDb)}`,
    );
  }
  const prefix = options.servicePrefix ?? 'terminal';
  const shared = `\`${options.sharedUserDb}\``;
  const coinLedger = `${shared}.point_transaction_tbl`;
  const pointsLedger = `${shared}.accumulated_point_transaction_history_tbl`;
  const KEY = 'external_transaction_id_column';
  // Cua so tinh bang dong ho MySQL: `created_at` / `updated_at` do DB ghi,
  // tranh lech mui gio giua tien trinh node va server DB.
  const windowSql = (column: string) =>
    `${column} >= ? AND ${column} >= NOW(6) - INTERVAL ? HOUR AND ${column} < NOW(6) - INTERVAL ? MINUTE`;
  const windowParams = [
    options.since,
    options.lookbackHours,
    options.graceMinutes,
  ];
  const findings: WalletFinding[] = [];

  // ---- Chieu xuoi: don da chot => khoa phai co ----
  // `created_at >= since`: chan don chot bang vi cu truoc cutover ma duoc luu
  // lai sau cutover (`updated_at` nhay) - xem dau tep.
  const orders = (
    await query(
      `SELECT o.id_column AS id, o.slug_column AS slug,
              o.subtotal_column AS subtotal, o.delivery_fee_column AS deliveryFee,
              p.payment_method_column AS method, p.amount_column AS amount,
              u.shared_user_id_column AS sharedUserId, r.name_column AS role
         FROM order_tbl o
         JOIN payment_tbl p ON p.id_column = o.payment_column
         LEFT JOIN user_tbl u ON u.id_column = o.owner_column
         LEFT JOIN role_tbl r ON r.id_column = u.role_column
        WHERE o.deleted_at_column IS NULL
          AND o.reference_number_column IS NOT NULL
          AND p.status_code_column = ?
          AND o.created_at_column >= ?
          AND ${windowSql('o.updated_at_column')}`,
      [PaymentStatus.COMPLETED, options.since, ...windowParams],
    )
  ).map(
    (row): OrderRow => ({
      id: String(row.id),
      slug: String(row.slug),
      subtotal: Number(row.subtotal ?? 0),
      deliveryFee: Number(row.deliveryFee ?? 0),
      method: (row.method as string) ?? null,
      amount: Number(row.amount ?? 0),
      sharedUserId: (row.sharedUserId as string) ?? null,
      role: (row.role as string) ?? null,
    }),
  );

  const expectDebit = orders.filter(
    (o) => o.method === PaymentMethod.POINT && o.amount > 0,
  );
  const expectAdd = orders
    .map((o) => ({
      order: o,
      points: calculateAccumulatedPoints(
        o.subtotal - o.deliveryFee,
        options.pointsPercentage,
      ),
    }))
    // Cung dieu kien voi `AccumulatedPointService.addPointsForOrder`.
    .filter(
      ({ order, points }) =>
        order.role === RoleEnum.Customer &&
        !!order.sharedUserId &&
        order.sharedUserId !== options.defaultCustomerSharedId &&
        points >= 1,
    );

  const debitKeyOf = (slug: string) => `${prefix}:${slug}:debit`;
  const addKeyOf = (slug: string) => `${prefix}:${slug}:add`;
  const haveDebit = await existing(
    query,
    coinLedger,
    KEY,
    expectDebit.map((o) => debitKeyOf(o.slug)),
  );
  const haveAdd = await existing(
    query,
    pointsLedger,
    KEY,
    expectAdd.map(({ order }) => addKeyOf(order.slug)),
  );

  for (const o of expectDebit) {
    const key = debitKeyOf(o.slug);
    if (!haveDebit.has(key)) {
      findings.push({
        kind: 'MISSING_DEBIT',
        key,
        detail: `order ${o.slug} was paid with ${o.amount} xu but shared-user has no debit under this key (customer ${o.sharedUserId})`,
      });
    }
  }
  for (const { order, points } of expectAdd) {
    const key = addKeyOf(order.slug);
    if (!haveAdd.has(key)) {
      findings.push({
        kind: 'MISSING_ADD',
        key,
        detail: `order ${order.slug} is finalized but shared-user has no points add under this key (customer ${order.sharedUserId}, ${points} points at ${options.pointsPercentage}%)`,
        order: {
          id: order.id,
          slug: order.slug,
          sharedUserId: order.sharedUserId,
          points,
        },
      });
    }
  }

  // ---- Chieu nguoc: giao dich `terminal:*` => ban ghi phai co ----
  const like = `${prefix}:%`;
  const keyRows = await query(
    `SELECT ${KEY} AS k FROM ${coinLedger}
      WHERE ${KEY} LIKE ? AND ${windowSql('created_at_column')}
     UNION ALL
     SELECT ${KEY} AS k FROM ${pointsLedger}
      WHERE ${KEY} LIKE ? AND ${windowSql('created_at_column')}`,
    [like, ...windowParams, like, ...windowParams],
  );
  const keys = keyRows.map((row) => String(row.k));
  const parsed = keys.map((key) => ({
    key,
    parsed: parseWalletKey(key, prefix),
  }));

  const slugsOf = (family: string) =>
    parsed
      .filter((p) => p.parsed.family === family)
      .map((p) => (p.parsed as { slug: string }).slug);

  const orderSlugs = slugsOf('order');
  const orderStates = new Map<string, OrderState>();
  for (const part of chunks([...new Set(orderSlugs)])) {
    // Khong loc `deleted_at`: don da xoa mem van la ban ghi cua giao dich.
    const rows = await query(
      `SELECT o.slug_column AS slug, o.reference_number_column AS ref,
              p.payment_method_column AS method, p.status_code_column AS status
         FROM order_tbl o
         LEFT JOIN payment_tbl p ON p.id_column = o.payment_column
        WHERE o.slug_column IN (${placeholders(part.length)})`,
      part,
    );
    rows.forEach((row) =>
      orderStates.set(String(row.slug), {
        finalized: row.ref !== null && row.status === PaymentStatus.COMPLETED,
        method: (row.method as string) ?? null,
      }),
    );
  }
  const debitKeys = parsed
    .filter(
      (p) =>
        p.parsed.family === 'order' &&
        p.parsed.op === 'debit' &&
        !p.parsed.release,
    )
    .map((p) => p.key);
  const released = await existing(
    query,
    coinLedger,
    KEY,
    debitKeys.map((key) => `${key}${RELEASE_SUFFIX}`),
  );
  const giftCards = await existing(
    query,
    'gift_card_tbl',
    'slug_column',
    slugsOf('giftcard'),
  );
  const cardOrders = await existing(
    query,
    'card_order_tbl',
    'slug_column',
    slugsOf('cardorder'),
  );
  const campaigns = await existing(
    query,
    'campaign_tbl',
    'slug_column',
    slugsOf('campaign'),
  );

  for (const { key, parsed: p } of parsed) {
    switch (p.family) {
      case 'legacy':
        break;
      case 'unknown':
        findings.push({
          kind: 'UNKNOWN_KEY',
          key,
          detail: 'key does not match any shape terminal writes',
        });
        break;
      case 'giftcard':
        if (!giftCards.has(p.slug)) {
          findings.push({
            kind: 'ORPHAN_GIFT_CARD',
            key,
            detail: `gift card ${p.slug} does not exist in terminal`,
          });
        }
        break;
      case 'cardorder':
        if (!cardOrders.has(p.slug)) {
          findings.push({
            kind: 'ORPHAN_CARD_ORDER',
            key,
            detail: `card order ${p.slug} does not exist in terminal`,
          });
        }
        break;
      case 'campaign':
        if (!campaigns.has(p.slug)) {
          findings.push({
            kind: 'ORPHAN_CAMPAIGN',
            key,
            detail: `campaign ${p.slug} does not exist in terminal`,
          });
        }
        break;
      case 'order': {
        if (p.release) break; // cap cua no xet o lenh debit
        const state = orderStates.get(p.slug);
        if (p.op === 'debit') {
          const ok =
            released.has(`${key}${RELEASE_SUFFIX}`) ||
            (state?.finalized && state.method === PaymentMethod.POINT);
          if (!ok) {
            findings.push({
              kind: 'ORPHAN_DEBIT',
              key,
              detail: state
                ? `order ${p.slug} is ${state.finalized ? `finalized with method ${state.method}` : 'not finalized'} and the debit was never released - the customer is charged for nothing`
                : `order ${p.slug} does not exist in terminal and the debit was never released`,
            });
          }
        } else if (p.op === 'add') {
          if (!state?.finalized) {
            findings.push({
              kind: 'ORPHAN_ADD',
              key,
              detail: state
                ? `order ${p.slug} is not finalized but earned points`
                : `order ${p.slug} does not exist in terminal but earned points`,
            });
          }
        } else if (!state) {
          findings.push({
            kind: 'ORPHAN_ORDER_OP',
            key,
            detail: `order ${p.slug} does not exist in terminal`,
          });
        }
        break;
      }
    }
  }

  return { ordersChecked: orders.length, keysChecked: keys.length, findings };
}
