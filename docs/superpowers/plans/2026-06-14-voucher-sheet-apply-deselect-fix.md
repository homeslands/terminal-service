# Voucher Sheet Apply/Deselect Robustness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix mọi case voucher sheet hiển thị "đã áp dụng / bỏ chọn" bị sai cho cả flow admin và staff — bao gồm case voucher đã dùng lượt cuối (eligible API không trả về voucher đó nhưng order vẫn đang dùng).

**Architecture:** Đưa nguồn dữ liệu voucher hiển thị về **union 2 nguồn**: `eligible response` ∪ `order.voucher` (snapshot). Tách logic hiển thị ra state-machine pure function `getVoucherDisplayState`. Thêm hook `useVoucherDisplayList` đồng bộ danh sách, và `useAutoRevalidateAppliedVoucher` tự re-validate + auto-remove khi context (cart/customer/payment/time) đổi. Sheet UI mỏng hơn — chỉ render theo display state.

**Tech Stack:** React 18, TypeScript, Zustand (`order-flow.store`), TanStack Query v5, Vitest, react-i18next, lodash (đã có sẵn).

**Working dir for all paths:** `/Users/phanquyetthang/terminal/app/order-ui`

---

## File structure

### Create (new files)
- `src/lib/voucher-display.ts` — types `IVoucherDisplay`, `VoucherDisplayState`, `VoucherInvalidReason`; pure functions `mergeVoucherSources`, `getVoucherDisplayState`.
- `src/lib/voucher-server-time.ts` — `serverNow()` + `setServerTimeOffset()`.
- `src/hooks/use-voucher-display-list.ts` — exposes `useVoucherDisplayList(orderSlug, eligibleParams)` → list của `IVoucherDisplay`.
- `src/hooks/use-auto-revalidate-applied-voucher.ts` — effect tự re-validate, auto-remove + toast.
- `src/tests/lib/voucher-display.test.ts` — unit tests cho merge + state machine.
- `src/tests/hooks/use-voucher-display-list.test.tsx` — hook test.
- `src/tests/hooks/use-auto-revalidate-applied-voucher.test.tsx` — hook test.

### Modify
- `src/locales/vi/voucher.json`, `src/locales/en/voucher.json` — thêm key mới: `reason.*`, `autoRemove.*`, `stale.*`.
- `src/components/app/sheet/staff-voucher-list-sheet-in-payment.tsx` — refactor render theo display state, bỏ logic `isVoucherValid` inline, bỏ `localVoucherList` self-management.
- `src/components/app/sheet/client-voucher-list-sheet-in-payment.tsx` — tương tự.
- `src/components/app/sheet/voucher-list-sheet.tsx` — tương tự (cart customer).
- `src/components/staff/staff-table-voucher-sheet.tsx` — tương tự.
- `src/components/app/sheet/staff-voucher-list-sheet-in-update-order-with-local-storage.tsx` — tương tự.
- `src/components/app/sheet/client-voucher-list-sheet-in-update-order-with-local-storage.tsx` — tương tự.
- `src/hooks/use-order.ts` (`useUpdateVoucherInOrder`, `useUpdatePublicVoucherInOrder`) — thêm optimistic + rollback.
- `src/hooks/use-voucher.ts` (`useApplyVoucher`, `useRemoveAppliedVoucher`, `useValidateVoucher`) — tách `mutationKey`, thêm onError rollback nếu có optimistic.
- `src/components/app/dialog/confirm-apply-voucher-dialog.tsx`, `confirm-remove-applied-voucher-dialog.tsx` — snapshot state + re-check on confirm.

---

## Conventions

- TDD: viết test fail → minimal code → test pass → commit. Test path mirror `src/` (đã có `src/tests/...`).
- Branch: `feature/voucher-display-state-machine` (cut từ `main`).
- Commit prefix theo project: `feat(voucher): ...`, `fix(voucher): ...`, `test(voucher): ...`, `refactor(voucher): ...`.
- Run: `npx vitest run <file>` cho test đơn lẻ. `npm run lint` trước commit.

---

## Phase 1 — Foundation pure utilities

### Task 1: Define display types

**Files:**
- Create: `src/lib/voucher-display.ts`

- [ ] **Step 1: Tạo skeleton file**

```ts
// src/lib/voucher-display.ts
import type { IVoucher } from '@/types'

export type VoucherSource = 'eligible' | 'applied_only'

export interface IVoucherDisplay extends IVoucher {
  _source: VoucherSource
  _isApplied: boolean
}

export type VoucherInvalidReason =
  | 'OUT_OF_USAGE'
  | 'EXPIRED'
  | 'NOT_IN_TIME_WINDOW'
  | 'MIN_ORDER_NOT_MET'
  | 'IDENTITY_REQUIRED'
  | 'PRODUCTS_ALL_REQUIRED'
  | 'PRODUCTS_AT_LEAST_ONE_REQUIRED'
  | 'MAX_ITEMS_EXCEEDED'
  | 'INACTIVE'
  | 'NOT_ELIGIBLE'

export type VoucherDisplayState =
  | { kind: 'AVAILABLE'; canApply: true; canRemove: false }
  | { kind: 'APPLIED_OK'; canApply: false; canRemove: true }
  | { kind: 'APPLIED_INVALID'; canApply: false; canRemove: true; reason: VoucherInvalidReason }
  | { kind: 'APPLIED_STALE'; canApply: false; canRemove: true; reason: VoucherInvalidReason }
  | { kind: 'INELIGIBLE'; canApply: false; canRemove: false; reason: VoucherInvalidReason }
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/voucher-display.ts
git commit -m "feat(voucher): add IVoucherDisplay + VoucherDisplayState types"
```

---

### Task 2: `mergeVoucherSources` — union eligible + applied

**Files:**
- Modify: `src/lib/voucher-display.ts`
- Test: `src/tests/lib/voucher-display.test.ts`

- [ ] **Step 1: Viết test fail**

```ts
// src/tests/lib/voucher-display.test.ts
import { describe, it, expect } from 'vitest'
import { mergeVoucherSources } from '@/lib/voucher-display'
import type { IVoucher } from '@/types'

const v = (slug: string, extra: Partial<IVoucher> = {}): IVoucher =>
  ({ slug, code: slug.toUpperCase(), remainingUsage: 1, ...extra } as IVoucher)

describe('mergeVoucherSources', () => {
  it('marks eligible vouchers as not applied', () => {
    const result = mergeVoucherSources([v('a'), v('b')], null)
    expect(result.map(x => [x.slug, x._source, x._isApplied])).toEqual([
      ['a', 'eligible', false],
      ['b', 'eligible', false],
    ])
  })

  it('marks applied voucher as applied when present in eligible', () => {
    const result = mergeVoucherSources([v('a'), v('b')], v('a'))
    const a = result.find(x => x.slug === 'a')!
    expect(a._source).toBe('eligible')
    expect(a._isApplied).toBe(true)
  })

  it('injects applied voucher as applied_only when missing from eligible', () => {
    const result = mergeVoucherSources([v('a')], v('z'))
    expect(result.map(x => x.slug).sort()).toEqual(['a', 'z'])
    const z = result.find(x => x.slug === 'z')!
    expect(z._source).toBe('applied_only')
    expect(z._isApplied).toBe(true)
  })

  it('prefers applied snapshot fields over eligible when both present', () => {
    const eligible = [v('a', { remainingUsage: 0 })]
    const applied = v('a', { remainingUsage: 1 })
    const result = mergeVoucherSources(eligible, applied)
    expect(result[0].remainingUsage).toBe(1)
  })

  it('returns empty list when both sources are empty', () => {
    expect(mergeVoucherSources([], null)).toEqual([])
  })
})
```

- [ ] **Step 2: Chạy test, expect FAIL ("mergeVoucherSources is not exported")**

Run: `npx vitest run src/tests/lib/voucher-display.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement minimal**

Append to `src/lib/voucher-display.ts`:

```ts
export function mergeVoucherSources(
  eligible: IVoucher[],
  applied: IVoucher | null,
): IVoucherDisplay[] {
  const map = new Map<string, IVoucherDisplay>()

  for (const v of eligible) {
    map.set(v.slug, { ...v, _source: 'eligible', _isApplied: false })
  }

  if (applied) {
    const existed = map.get(applied.slug)
    map.set(applied.slug, {
      ...(existed ?? {}),
      ...applied,
      _source: existed ? 'eligible' : 'applied_only',
      _isApplied: true,
    } as IVoucherDisplay)
  }

  return Array.from(map.values())
}
```

- [ ] **Step 4: Test pass**

Run: `npx vitest run src/tests/lib/voucher-display.test.ts`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/voucher-display.ts src/tests/lib/voucher-display.test.ts
git commit -m "feat(voucher): merge eligible + applied voucher sources into single display list"
```

---

### Task 3: `getVoucherDisplayState` — state machine

**Files:**
- Modify: `src/lib/voucher-display.ts`
- Test: `src/tests/lib/voucher-display.test.ts`

- [ ] **Step 1: Viết test fail**

Append to test file:

```ts
import { getVoucherDisplayState } from '@/lib/voucher-display'
import { VOUCHER_TYPE, APPLICABILITY_RULE } from '@/constants'
import moment from 'moment'

const baseCtx = {
  subtotalAfterPromotion: 100_000,
  totalQuantity: 2,
  productSlugs: ['p1'],
  hasCustomerOwner: true,
}

const validV = (over: Partial<IVoucher> = {}): IVoucher => ({
  slug: 'v',
  code: 'V',
  isActive: true,
  remainingUsage: 5,
  maxUsage: 10,
  minOrderValue: 0,
  type: VOUCHER_TYPE.PERCENT_ORDER,
  startDate: moment().subtract(1, 'day').toISOString(),
  endDate: moment().add(10, 'days').toISOString(),
  voucherProducts: [],
  applicabilityRule: APPLICABILITY_RULE.AT_LEAST_ONE_REQUIRED,
  isVerificationIdentity: false,
  maxItems: 0,
  ...over,
} as unknown as IVoucher)

describe('getVoucherDisplayState', () => {
  it('AVAILABLE when valid + not applied + from eligible', () => {
    const d = { ...validV(), _source: 'eligible' as const, _isApplied: false }
    expect(getVoucherDisplayState(d, baseCtx).kind).toBe('AVAILABLE')
  })

  it('APPLIED_OK when valid + applied + from eligible', () => {
    const d = { ...validV(), _source: 'eligible' as const, _isApplied: true }
    expect(getVoucherDisplayState(d, baseCtx).kind).toBe('APPLIED_OK')
  })

  it('APPLIED_INVALID when applied + invalid (min order not met)', () => {
    const d = {
      ...validV({ minOrderValue: 200_000 }),
      _source: 'eligible' as const,
      _isApplied: true,
    }
    const s = getVoucherDisplayState(d, baseCtx)
    expect(s.kind).toBe('APPLIED_INVALID')
    expect(s.kind === 'APPLIED_INVALID' && s.reason).toBe('MIN_ORDER_NOT_MET')
  })

  it('APPLIED_STALE when applied_only (not in eligible)', () => {
    const d = {
      ...validV({ remainingUsage: 0 }),
      _source: 'applied_only' as const,
      _isApplied: true,
    }
    const s = getVoucherDisplayState(d, baseCtx)
    expect(s.kind).toBe('APPLIED_STALE')
    expect(s.kind === 'APPLIED_STALE' && s.reason).toBe('OUT_OF_USAGE')
  })

  it('APPLIED_STALE with NOT_ELIGIBLE reason when remainingUsage > 0', () => {
    const d = {
      ...validV({ remainingUsage: 3 }),
      _source: 'applied_only' as const,
      _isApplied: true,
    }
    const s = getVoucherDisplayState(d, baseCtx)
    expect(s.kind).toBe('APPLIED_STALE')
    expect(s.kind === 'APPLIED_STALE' && s.reason).toBe('NOT_ELIGIBLE')
  })

  it('INELIGIBLE when invalid + not applied', () => {
    const d = {
      ...validV({ remainingUsage: 0 }),
      _source: 'eligible' as const,
      _isApplied: false,
    }
    const s = getVoucherDisplayState(d, baseCtx)
    expect(s.kind).toBe('INELIGIBLE')
    expect(s.kind === 'INELIGIBLE' && s.reason).toBe('OUT_OF_USAGE')
  })
})
```

- [ ] **Step 2: Test FAIL** (`getVoucherDisplayState not exported`)

Run: `npx vitest run src/tests/lib/voucher-display.test.ts`

- [ ] **Step 3: Implement**

Append to `src/lib/voucher-display.ts`:

```ts
import moment from 'moment'
import { APPLICABILITY_RULE, VOUCHER_TYPE } from '@/constants'
import { isVoucherApplicableToCartItems } from '@/utils'
import { isVoucherExpired, isVoucherInActiveTimeWindow } from '@/utils/voucher-time'

export interface VoucherValidationContext {
  subtotalAfterPromotion: number
  totalQuantity: number
  productSlugs: string[]
  hasCustomerOwner: boolean
}

function firstInvalidReason(
  v: IVoucher,
  ctx: VoucherValidationContext,
): VoucherInvalidReason | null {
  if (!v.isActive) return 'INACTIVE'
  if (isVoucherExpired(v)) return 'EXPIRED'
  if (!isVoucherInActiveTimeWindow(v)) return 'NOT_IN_TIME_WINDOW'
  if ((v.remainingUsage ?? 0) <= 0) return 'OUT_OF_USAGE'

  const sevenAm = moment().set({ hour: 7, minute: 0, second: 0, millisecond: 0 })
  if (!sevenAm.isSameOrBefore(moment(v.endDate))) return 'EXPIRED'

  if (v.isVerificationIdentity && !ctx.hasCustomerOwner) return 'IDENTITY_REQUIRED'

  if (
    v.type !== VOUCHER_TYPE.SAME_PRICE_PRODUCT &&
    (v.minOrderValue ?? 0) > ctx.subtotalAfterPromotion
  ) {
    return 'MIN_ORDER_NOT_MET'
  }

  const productSlugs = v.voucherProducts?.map(vp => vp.product.slug) ?? []
  if (productSlugs.length > 0) {
    const ok = isVoucherApplicableToCartItems(
      ctx.productSlugs,
      productSlugs,
      v.applicabilityRule,
    )
    if (!ok) {
      return v.applicabilityRule === APPLICABILITY_RULE.ALL_REQUIRED
        ? 'PRODUCTS_ALL_REQUIRED'
        : 'PRODUCTS_AT_LEAST_ONE_REQUIRED'
    }
  }

  if (v.maxItems && v.maxItems > 0 && ctx.totalQuantity > v.maxItems) {
    return 'MAX_ITEMS_EXCEEDED'
  }

  return null
}

export function getVoucherDisplayState(
  v: IVoucherDisplay,
  ctx: VoucherValidationContext,
): VoucherDisplayState {
  if (v._source === 'applied_only') {
    const reason: VoucherInvalidReason =
      (v.remainingUsage ?? 0) === 0 ? 'OUT_OF_USAGE' : 'NOT_ELIGIBLE'
    return { kind: 'APPLIED_STALE', canApply: false, canRemove: true, reason }
  }

  const reason = firstInvalidReason(v, ctx)
  if (reason === null) {
    return v._isApplied
      ? { kind: 'APPLIED_OK', canApply: false, canRemove: true }
      : { kind: 'AVAILABLE', canApply: true, canRemove: false }
  }
  return v._isApplied
    ? { kind: 'APPLIED_INVALID', canApply: false, canRemove: true, reason }
    : { kind: 'INELIGIBLE', canApply: false, canRemove: false, reason }
}
```

- [ ] **Step 4: Test pass**

Run: `npx vitest run src/tests/lib/voucher-display.test.ts`
Expected: 11 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/voucher-display.ts src/tests/lib/voucher-display.test.ts
git commit -m "feat(voucher): add getVoucherDisplayState pure state machine"
```

---

### Task 4: Reason → i18n key mapper

**Files:**
- Modify: `src/lib/voucher-display.ts`
- Test: `src/tests/lib/voucher-display.test.ts`

- [ ] **Step 1: Test fail**

Append:

```ts
import { voucherReasonI18nKey } from '@/lib/voucher-display'

describe('voucherReasonI18nKey', () => {
  it('returns correct keys for known reasons', () => {
    expect(voucherReasonI18nKey('OUT_OF_USAGE')).toBe('voucher.reason.outOfUsage')
    expect(voucherReasonI18nKey('EXPIRED')).toBe('voucher.reason.expired')
    expect(voucherReasonI18nKey('NOT_IN_TIME_WINDOW')).toBe('voucher.reason.notInTimeWindow')
    expect(voucherReasonI18nKey('MIN_ORDER_NOT_MET')).toBe('voucher.reason.minOrderNotMet')
    expect(voucherReasonI18nKey('IDENTITY_REQUIRED')).toBe('voucher.reason.identityRequired')
    expect(voucherReasonI18nKey('PRODUCTS_ALL_REQUIRED')).toBe('voucher.reason.productsAllRequired')
    expect(voucherReasonI18nKey('PRODUCTS_AT_LEAST_ONE_REQUIRED')).toBe('voucher.reason.productsAtLeastOneRequired')
    expect(voucherReasonI18nKey('MAX_ITEMS_EXCEEDED')).toBe('voucher.reason.maxItemsExceeded')
    expect(voucherReasonI18nKey('INACTIVE')).toBe('voucher.reason.inactive')
    expect(voucherReasonI18nKey('NOT_ELIGIBLE')).toBe('voucher.reason.notEligible')
  })
})
```

- [ ] **Step 2: Implement**

Append to `src/lib/voucher-display.ts`:

```ts
const REASON_KEYS: Record<VoucherInvalidReason, string> = {
  OUT_OF_USAGE: 'voucher.reason.outOfUsage',
  EXPIRED: 'voucher.reason.expired',
  NOT_IN_TIME_WINDOW: 'voucher.reason.notInTimeWindow',
  MIN_ORDER_NOT_MET: 'voucher.reason.minOrderNotMet',
  IDENTITY_REQUIRED: 'voucher.reason.identityRequired',
  PRODUCTS_ALL_REQUIRED: 'voucher.reason.productsAllRequired',
  PRODUCTS_AT_LEAST_ONE_REQUIRED: 'voucher.reason.productsAtLeastOneRequired',
  MAX_ITEMS_EXCEEDED: 'voucher.reason.maxItemsExceeded',
  INACTIVE: 'voucher.reason.inactive',
  NOT_ELIGIBLE: 'voucher.reason.notEligible',
}

export function voucherReasonI18nKey(reason: VoucherInvalidReason): string {
  return REASON_KEYS[reason]
}
```

- [ ] **Step 3: Test pass + commit**

```bash
npx vitest run src/tests/lib/voucher-display.test.ts
git add src/lib/voucher-display.ts src/tests/lib/voucher-display.test.ts
git commit -m "feat(voucher): map invalid reasons to i18n keys"
```

---

### Task 5: i18n entries

**Files:**
- Modify: `src/locales/vi/voucher.json`
- Modify: `src/locales/en/voucher.json`

- [ ] **Step 1: Tìm object hiện tại + chèn block `reason` và `autoRemove`**

Đọc 20 dòng đầu của mỗi file để tìm vị trí thêm. Trong `src/locales/vi/voucher.json` thêm bên trong object `voucher`:

```json
"reason": {
  "outOfUsage": "Voucher đã hết lượt",
  "expired": "Voucher đã hết hạn",
  "notInTimeWindow": "Ngoài giờ áp dụng",
  "minOrderNotMet": "Chưa đủ giá trị đơn tối thiểu",
  "identityRequired": "Cần chọn khách hàng để dùng voucher",
  "productsAllRequired": "Một số sản phẩm trong đơn không thuộc voucher",
  "productsAtLeastOneRequired": "Không có sản phẩm nào trong đơn áp dụng voucher",
  "maxItemsExceeded": "Vượt quá số lượng sản phẩm tối đa",
  "inactive": "Voucher đang tạm ngưng",
  "notEligible": "Voucher không còn áp dụng cho đơn hàng hiện tại"
},
"autoRemove": {
  "title": "Voucher {{code}} đã được gỡ tự động",
  "OUT_OF_USAGE": "Voucher đã hết lượt sử dụng",
  "EXPIRED": "Voucher đã hết hạn",
  "NOT_IN_TIME_WINDOW": "Ngoài khung giờ áp dụng",
  "MIN_ORDER_NOT_MET": "Đơn không còn đủ giá trị tối thiểu",
  "IDENTITY_REQUIRED": "Voucher cần khách hàng có tài khoản",
  "PRODUCTS_ALL_REQUIRED": "Sản phẩm trong đơn không khớp voucher",
  "PRODUCTS_AT_LEAST_ONE_REQUIRED": "Không còn sản phẩm áp dụng voucher",
  "MAX_ITEMS_EXCEEDED": "Vượt số lượng sản phẩm tối đa",
  "INACTIVE": "Voucher đã ngưng",
  "NOT_ELIGIBLE": "Voucher không còn áp dụng cho đơn"
},
```

- [ ] **Step 2: Thêm bản EN tương ứng vào `src/locales/en/voucher.json`** (mirror keys với câu tiếng Anh tương ứng — "Voucher out of usage", "Voucher expired"...).

- [ ] **Step 3: Verify JSON valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/locales/vi/voucher.json','utf8'))" && node -e "JSON.parse(require('fs').readFileSync('src/locales/en/voucher.json','utf8'))"`
Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/locales/vi/voucher.json src/locales/en/voucher.json
git commit -m "feat(voucher): add i18n keys for invalid reasons and auto-remove notices"
```

---

## Phase 2 — Reactive hooks

### Task 6: `useVoucherDisplayList`

**Files:**
- Create: `src/hooks/use-voucher-display-list.ts`
- Test: `src/tests/hooks/use-voucher-display-list.test.tsx`

- [ ] **Step 1: Test fail**

```tsx
// src/tests/hooks/use-voucher-display-list.test.tsx
import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useVoucherDisplayList } from '@/hooks/use-voucher-display-list'
import type { IVoucher } from '@/types'

vi.mock('@/hooks/use-voucher', () => ({
  useVouchersForOrder: () => ({
    data: { result: { items: [{ slug: 'a' } as IVoucher], hasNext: false, page: 1 } },
    refetch: vi.fn(),
  }),
}))

describe('useVoucherDisplayList', () => {
  it('includes applied voucher even when absent from eligible response', () => {
    const applied = { slug: 'z', code: 'Z' } as IVoucher
    const { result } = renderHook(() =>
      useVoucherDisplayList({
        enabled: true,
        params: { hasPaging: true, page: 1, size: 10 } as any,
        appliedVoucher: applied,
      }),
    )

    expect(result.current.list.map(v => v.slug).sort()).toEqual(['a', 'z'])
    const z = result.current.list.find(v => v.slug === 'z')!
    expect(z._source).toBe('applied_only')
    expect(z._isApplied).toBe(true)
  })
})
```

- [ ] **Step 2: Implement**

```ts
// src/hooks/use-voucher-display-list.ts
import { useMemo } from 'react'
import { useVouchersForOrder } from '@/hooks/use-voucher'
import { mergeVoucherSources, type IVoucherDisplay } from '@/lib/voucher-display'
import type { IGetAllVoucherRequest, IVoucher } from '@/types'

interface Options {
  enabled: boolean
  params: IGetAllVoucherRequest
  appliedVoucher: IVoucher | null
  extraVouchers?: IVoucher[] // ex: voucher from "input code" search
}

export function useVoucherDisplayList(opts: Options): {
  list: IVoucherDisplay[]
  hasMore: boolean
  refetch: () => void
} {
  const { data, refetch } = useVouchersForOrder(opts.params, opts.enabled)

  const list = useMemo(() => {
    const eligible: IVoucher[] = data?.result?.items ?? []
    const combined = opts.extraVouchers
      ? [...opts.extraVouchers.filter(e => !eligible.some(v => v.slug === e.slug)), ...eligible]
      : eligible
    return mergeVoucherSources(combined, opts.appliedVoucher)
  }, [data?.result?.items, opts.appliedVoucher, opts.extraVouchers])

  return { list, hasMore: !!data?.result?.hasNext, refetch }
}
```

- [ ] **Step 3: Test pass + commit**

```bash
npx vitest run src/tests/hooks/use-voucher-display-list.test.tsx
git add src/hooks/use-voucher-display-list.ts src/tests/hooks/use-voucher-display-list.test.tsx
git commit -m "feat(voucher): add useVoucherDisplayList that unions eligible + applied snapshot"
```

---

### Task 7: `useAutoRevalidateAppliedVoucher`

**Files:**
- Create: `src/hooks/use-auto-revalidate-applied-voucher.ts`
- Test: `src/tests/hooks/use-auto-revalidate-applied-voucher.test.tsx`

- [ ] **Step 1: Test fail**

```tsx
// src/tests/hooks/use-auto-revalidate-applied-voucher.test.tsx
import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import moment from 'moment'
import { useAutoRevalidateAppliedVoucher } from '@/hooks/use-auto-revalidate-applied-voucher'
import type { IVoucher } from '@/types'
import { VOUCHER_TYPE, APPLICABILITY_RULE } from '@/constants'

const v: IVoucher = {
  slug: 'v',
  code: 'V',
  isActive: true,
  remainingUsage: 5,
  minOrderValue: 200_000,
  maxUsage: 10,
  type: VOUCHER_TYPE.PERCENT_ORDER,
  startDate: moment().subtract(1, 'day').toISOString(),
  endDate: moment().add(10, 'days').toISOString(),
  voucherProducts: [],
  applicabilityRule: APPLICABILITY_RULE.AT_LEAST_ONE_REQUIRED,
  isVerificationIdentity: false,
  maxItems: 0,
} as unknown as IVoucher

describe('useAutoRevalidateAppliedVoucher', () => {
  it('calls onAutoRemove with reason when applied voucher becomes invalid', () => {
    const onAutoRemove = vi.fn()
    renderHook(() =>
      useAutoRevalidateAppliedVoucher({
        appliedVoucher: v, // minOrderValue 200k
        context: {
          subtotalAfterPromotion: 100_000, // not enough
          totalQuantity: 1,
          productSlugs: ['p1'],
          hasCustomerOwner: true,
        },
        onAutoRemove,
      }),
    )
    expect(onAutoRemove).toHaveBeenCalledWith('MIN_ORDER_NOT_MET')
  })

  it('does not fire when voucher is valid', () => {
    const onAutoRemove = vi.fn()
    renderHook(() =>
      useAutoRevalidateAppliedVoucher({
        appliedVoucher: v,
        context: {
          subtotalAfterPromotion: 500_000,
          totalQuantity: 1,
          productSlugs: ['p1'],
          hasCustomerOwner: true,
        },
        onAutoRemove,
      }),
    )
    expect(onAutoRemove).not.toHaveBeenCalled()
  })

  it('does nothing when applied voucher is null', () => {
    const onAutoRemove = vi.fn()
    renderHook(() =>
      useAutoRevalidateAppliedVoucher({
        appliedVoucher: null,
        context: { subtotalAfterPromotion: 0, totalQuantity: 0, productSlugs: [], hasCustomerOwner: false },
        onAutoRemove,
      }),
    )
    expect(onAutoRemove).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Implement**

```ts
// src/hooks/use-auto-revalidate-applied-voucher.ts
import { useEffect, useRef } from 'react'
import type { IVoucher } from '@/types'
import {
  getVoucherDisplayState,
  type VoucherInvalidReason,
  type VoucherValidationContext,
} from '@/lib/voucher-display'

interface Args {
  appliedVoucher: IVoucher | null
  context: VoucherValidationContext
  onAutoRemove: (reason: VoucherInvalidReason) => void
  // Polling interval (ms) for time-window/expiry watchdog. 0 disables.
  pollMs?: number
}

export function useAutoRevalidateAppliedVoucher({
  appliedVoucher,
  context,
  onAutoRemove,
  pollMs = 30_000,
}: Args) {
  const onAutoRemoveRef = useRef(onAutoRemove)
  onAutoRemoveRef.current = onAutoRemove

  useEffect(() => {
    if (!appliedVoucher) return
    const display = {
      ...appliedVoucher,
      _source: 'eligible' as const,
      _isApplied: true,
    }
    const state = getVoucherDisplayState(display, context)
    if (state.kind === 'APPLIED_INVALID' || state.kind === 'APPLIED_STALE') {
      onAutoRemoveRef.current(state.reason)
    }
  }, [
    appliedVoucher,
    context.subtotalAfterPromotion,
    context.totalQuantity,
    context.hasCustomerOwner,
    // productSlugs is array — compare via stable join
    context.productSlugs.join('|'),
  ])

  useEffect(() => {
    if (!appliedVoucher || pollMs <= 0) return
    const id = setInterval(() => {
      const display = {
        ...appliedVoucher,
        _source: 'eligible' as const,
        _isApplied: true,
      }
      const state = getVoucherDisplayState(display, context)
      if (state.kind === 'APPLIED_INVALID' || state.kind === 'APPLIED_STALE') {
        onAutoRemoveRef.current(state.reason)
      }
    }, pollMs)
    return () => clearInterval(id)
  }, [appliedVoucher, context, pollMs])
}
```

- [ ] **Step 3: Test pass + commit**

```bash
npx vitest run src/tests/hooks/use-auto-revalidate-applied-voucher.test.tsx
git add src/hooks/use-auto-revalidate-applied-voucher.ts src/tests/hooks/use-auto-revalidate-applied-voucher.test.tsx
git commit -m "feat(voucher): auto re-validate + auto remove applied voucher when context changes"
```

---

### Task 8: Re-export from `src/hooks/index.ts`

**Files:**
- Modify: `src/hooks/index.ts`

- [ ] **Step 1: Đọc file để biết format**

Run: `head -20 src/hooks/index.ts`

- [ ] **Step 2: Thêm 2 dòng export**

```ts
export * from './use-voucher-display-list'
export * from './use-auto-revalidate-applied-voucher'
```

- [ ] **Step 3: Build check + commit**

```bash
npx tsc -b --pretty false
git add src/hooks/index.ts
git commit -m "feat(voucher): re-export new voucher display hooks"
```

---

## Phase 3 — Refactor canonical sheet

### Task 9: Refactor `staff-voucher-list-sheet-in-payment.tsx` (Part 1 — data layer)

**Files:**
- Modify: `src/components/app/sheet/staff-voucher-list-sheet-in-payment.tsx`

- [ ] **Step 1: Đọc full file, xác định chỗ giữ và chỗ thay**

Run: `wc -l src/components/app/sheet/staff-voucher-list-sheet-in-payment.tsx`
Đọc theo block 200 dòng. Chú ý:
- Bỏ: `localVoucherList`, `setLocalVoucherList`, các `useEffect` accumulate, hàm `isVoucherValid` inline, hàm `getVoucherErrorMessage` inline.
- Giữ: pagination, copy code, `getUsageFrequencyText`, search by code (`inputValue`), render JSX scaffolding.

- [ ] **Step 2: Thay block fetch + state bằng hook mới**

Trong component, thay:

```tsx
const [localVoucherList, setLocalVoucherList] = useState<IVoucher[]>([])
// ...nhiều useEffect accumulate...
const { data: voucherList, refetch: refetchVoucherList } = useVouchersForOrder(...)
```

bằng:

```tsx
const { list: displayList, hasMore, refetch: refetchVoucherList } =
  useVoucherDisplayList({
    enabled: sheetOpen,
    params: voucherForOrderRequestParam,
    appliedVoucher: orderData?.voucher ?? null,
    extraVouchers: specificVoucher?.result ? [specificVoucher.result] : [],
  })
```

Xoá toàn bộ accumulate-effect cũ (Step 3, 4 trong file gốc — block dòng ~349-413).

- [ ] **Step 3: Lint + run unit tests**

```bash
npx vitest run src/tests/lib/voucher-display.test.ts src/tests/hooks/use-voucher-display-list.test.tsx
npm run lint -- src/components/app/sheet/staff-voucher-list-sheet-in-payment.tsx
```

- [ ] **Step 4: Commit**

```bash
git add src/components/app/sheet/staff-voucher-list-sheet-in-payment.tsx
git commit -m "refactor(voucher): staff payment sheet uses useVoucherDisplayList for unified list"
```

---

### Task 10: Refactor `staff-voucher-list-sheet-in-payment.tsx` (Part 2 — render via display state)

**Files:**
- Modify: `src/components/app/sheet/staff-voucher-list-sheet-in-payment.tsx`

- [ ] **Step 1: Thay `renderVoucherCard` để dùng state machine**

```tsx
import {
  getVoucherDisplayState,
  voucherReasonI18nKey,
  type VoucherValidationContext,
  type IVoucherDisplay,
} from '@/lib/voucher-display'

const ctx: VoucherValidationContext = useMemo(() => ({
  subtotalAfterPromotion: minOrderValue,
  totalQuantity: nonGiftOrderItems.reduce((s, i) => s + i.quantity, 0),
  productSlugs: nonGiftOrderItems.map(i => i.variant.product.slug),
  hasCustomerOwner: isCustomerOwner,
}), [minOrderValue, nonGiftOrderItems, isCustomerOwner])

const renderVoucherCard = (voucher: IVoucherDisplay) => {
  const state = getVoucherDisplayState(voucher, ctx)
  const isSelected = selectedVoucher === voucher.slug
  const isCurrentlyApplied = state.kind === 'APPLIED_OK'
    || state.kind === 'APPLIED_INVALID'
    || state.kind === 'APPLIED_STALE'
  const isDisabled = !state.canApply && !state.canRemove
  const reasonMsg =
    'reason' in state ? t(voucherReasonI18nKey(state.reason)) : ''
  // ... reuse existing JSX scaffolding, but feed it (state, isDisabled, isSelected, reasonMsg)
}
```

- [ ] **Step 2: Thay điều kiện disabled của Checkbox**

```tsx
<Checkbox
  id={voucher.slug}
  checked={selectedVoucher === voucher.slug}
  onCheckedChange={(checked) => setSelectedVoucher(checked ? voucher.slug : '')}
  disabled={isDisabled}
  className="w-5 h-5 rounded-full"
/>
```

- [ ] **Step 3: Lint + manual smoke (yêu cầu user)**

```bash
npm run lint -- src/components/app/sheet/staff-voucher-list-sheet-in-payment.tsx
```

Manual check: mở `/system/order/<orderSlug>` → mở voucher sheet → verify 5 scenarios: available / applied / applied_invalid / applied_stale (giả lập bằng cách remove cart item sau khi apply) / ineligible.

- [ ] **Step 4: Commit**

```bash
git add src/components/app/sheet/staff-voucher-list-sheet-in-payment.tsx
git commit -m "refactor(voucher): staff payment sheet renders via getVoucherDisplayState"
```

---

### Task 11: Wire `useAutoRevalidateAppliedVoucher` into staff payment sheet

**Files:**
- Modify: `src/components/app/sheet/staff-voucher-list-sheet-in-payment.tsx`

- [ ] **Step 1: Thêm hook + handler removeVoucher**

```tsx
useAutoRevalidateAppliedVoucher({
  appliedVoucher: orderData?.voucher ?? null,
  context: ctx,
  onAutoRemove: (reason) => {
    if (!orderData?.voucher || !orderData?.slug) return
    updateVoucherInOrder(
      {
        slug: orderData.slug,
        voucher: null,
        orderItems: orderData.orderItems.map(item => ({
          quantity: item.quantity,
          variant: item.variant.slug,
          note: item.note,
          promotion: item.promotion ? item.promotion.slug : null,
        })),
      },
      {
        onSuccess: () => {
          showToast(
            tToast('voucher.autoRemove.title', { code: orderData.voucher!.code }) +
            ' — ' + tToast(`voucher.autoRemove.${reason}`)
          )
          onSuccess()
        },
      },
    )
  },
})
```

- [ ] **Step 2: Commit**

```bash
git add src/components/app/sheet/staff-voucher-list-sheet-in-payment.tsx
git commit -m "feat(voucher): auto-remove invalid applied voucher in staff payment sheet"
```

---

## Phase 4 — Replicate to other 5 sheets

### Task 12: Refactor `client-voucher-list-sheet-in-payment.tsx`

Same 3 steps as Task 9–11, but with client API (`useUpdatePublicVoucherInOrder`).

- [ ] Replace data layer with `useVoucherDisplayList`.
- [ ] Replace render with `getVoucherDisplayState`.
- [ ] Wire `useAutoRevalidateAppliedVoucher`.
- [ ] Lint + commit:

```bash
git add src/components/app/sheet/client-voucher-list-sheet-in-payment.tsx
git commit -m "refactor(voucher): client payment sheet uses display state machine"
```

### Task 13: Refactor `voucher-list-sheet.tsx` (customer cart, pre-checkout)

- [ ] Voucher in cart store via `addVoucher`/`removeVoucher` (`order-flow.store.ts:1714-1719`).
- [ ] Replace data layer + render layer.
- [ ] Wire `useAutoRevalidateAppliedVoucher` with `onAutoRemove = () => removeVoucher()`.
- [ ] Commit.

### Task 14: Refactor `staff-table-voucher-sheet.tsx`

- [ ] Logic `handleToggle` (file:186-218): bỏ short-circuit, đổi sang dispatch theo display state.
- [ ] Wire auto-revalidate.
- [ ] Commit.

### Task 15: Refactor `staff-voucher-list-sheet-in-update-order-with-local-storage.tsx`

- [ ] Same pattern.

### Task 16: Refactor `client-voucher-list-sheet-in-update-order-with-local-storage.tsx`

- [ ] Same pattern.

(Mỗi task commit riêng để diff dễ review.)

---

## Phase 5 — Optimistic mutations + rollback

### Task 17: Add optimistic to `useUpdateVoucherInOrder`

**Files:**
- Modify: `src/hooks/use-order.ts`

- [ ] **Step 1: Tìm `useUpdateVoucherInOrder` (~line 237-267) và update**

```ts
import { useQueryClient } from '@tanstack/react-query'
import { QUERYKEY } from '@/constants'

export const useUpdateVoucherInOrder = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: updateVoucherInOrderApi,
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: [QUERYKEY.orderBySlug, input.slug] })
      const prev = qc.getQueryData([QUERYKEY.orderBySlug, input.slug])
      // optimistic: set voucher = null (or input.voucher) on cached order
      qc.setQueryData([QUERYKEY.orderBySlug, input.slug], (old: any) =>
        old?.result ? { ...old, result: { ...old.result, voucher: null } } : old,
      )
      return { prev }
    },
    onError: (_err, input, ctx) => {
      if (ctx?.prev) qc.setQueryData([QUERYKEY.orderBySlug, input.slug], ctx.prev)
    },
    onSettled: (_d, _e, input) => {
      qc.invalidateQueries({ queryKey: [QUERYKEY.orderBySlug, input.slug] })
      qc.invalidateQueries({ queryKey: [QUERYKEY.vouchersForOrder] })
    },
  })
}
```

- [ ] **Step 2: Lint + commit**

```bash
git add src/hooks/use-order.ts
git commit -m "feat(voucher): optimistic update + rollback for updateVoucherInOrder"
```

### Task 18: Same for `useUpdatePublicVoucherInOrder` (client side)

- [ ] Same pattern, commit.

### Task 19: Same for `useApplyVoucher` / `useRemoveAppliedVoucher` (admin)

- [ ] Update `src/hooks/use-voucher.ts` (~line 192-206) with optimistic + rollback over `[QUERYKEY.voucher, slug]` cache.
- [ ] Commit.

---

## Phase 6 — Admin confirm dialog snapshot

### Task 20: Snapshot state in `confirm-apply-voucher-dialog.tsx`

**Files:**
- Modify: `src/components/app/dialog/confirm-apply-voucher-dialog.tsx`

- [ ] **Step 1: Capture snapshot on open**

```tsx
const snapshotRef = useRef<{ voucherSlug: string; productSlugs: string[] } | null>(null)

useEffect(() => {
  if (open) snapshotRef.current = {
    voucherSlug: voucher.slug,
    productSlugs: products.map(p => p.slug),
  }
}, [open])
```

- [ ] **Step 2: On confirm, compare with current**

```tsx
const onConfirm = () => {
  const snap = snapshotRef.current
  if (!snap) return
  const currentSlugs = products.map(p => p.slug)
  const drift =
    snap.voucherSlug !== voucher.slug
    || snap.productSlugs.length !== currentSlugs.length
    || snap.productSlugs.some((s, i) => s !== currentSlugs[i])
  if (drift) {
    showToast(t('voucher.confirmDriftRetry'))
    return
  }
  mutate(...)
}
```

- [ ] **Step 3: i18n + commit**

Add key `voucher.confirmDriftRetry` to both locale files. Commit.

### Task 21: Same for `confirm-remove-applied-voucher-dialog.tsx`

---

## Phase 7 — Integration tests cho case mới (last usage)

### Task 22: Test "applied voucher persists when eligible removes it"

**Files:**
- Create: `src/tests/integration/voucher-last-usage.test.tsx`

- [ ] **Step 1: Setup test render with QueryClientProvider**

```tsx
// src/tests/integration/voucher-last-usage.test.tsx
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/hooks/use-voucher', () => ({
  useVouchersForOrder: () => ({
    data: { result: { items: [], hasNext: false, page: 1 } }, // ← simulate "voucher removed from eligible"
    refetch: vi.fn(),
  }),
  useValidateVoucher: () => ({ mutate: vi.fn() }),
  useSpecificVoucher: () => ({ data: null, refetch: vi.fn() }),
}))

const order = {
  slug: 'order-1',
  voucher: { slug: 'last-v', code: 'LASTV', remainingUsage: 0, isActive: true } as any,
  orderItems: [],
  owner: { role: { name: 'CUSTOMER' }, phonenumber: '0900000000', slug: 'u1' },
} as any
```

- [ ] **Step 2: Assert applied voucher visible in sheet**

```tsx
import StaffVoucherListSheetInPayment from '@/components/app/sheet/staff-voucher-list-sheet-in-payment'

describe('voucher sheet: applied voucher not in eligible response', () => {
  it('still renders the applied voucher with Deselect available', async () => {
    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <StaffVoucherListSheetInPayment order={order} onSuccess={() => {}} />
      </QueryClientProvider>,
    )
    // open the sheet trigger
    screen.getByRole('button', { name: /voucher/i }).click()
    // applied voucher should appear
    expect(await screen.findByText(/LASTV/)).toBeInTheDocument()
    // checkbox should be enabled to allow remove
    const checkbox = screen.getByRole('checkbox', { name: /last-v/i }) as HTMLInputElement
    expect(checkbox.disabled).toBe(false)
    expect(checkbox.checked).toBe(true)
  })
})
```

- [ ] **Step 3: Test pass + commit**

```bash
npx vitest run src/tests/integration/voucher-last-usage.test.tsx
git add src/tests/integration/voucher-last-usage.test.tsx
git commit -m "test(voucher): applied voucher stays in sheet when eligible omits it"
```

---

## Final verification

### Task 23: Full lint + test + build

- [ ] Run all:

```bash
npm run lint
npm run test
npm run build
```

- [ ] Expected: 0 errors, all tests pass, build succeeds.

- [ ] **Manual smoke checklist** (yêu cầu run dev server `npm run dev`):
  - [ ] Apply voucher → remove item làm subtotal < minOrderValue → voucher auto remove + toast.
  - [ ] Apply voucher last-usage → close sheet → reopen → voucher vẫn hiện ở vị trí applied + có thể bỏ chọn.
  - [ ] Apply voucher → đổi customer (bỏ customer) cho voucher cần identity → auto remove + toast.
  - [ ] Apply voucher → chuyển sang payment method khác (không match voucher) → auto remove.
  - [ ] Voucher hết hạn lúc đang ngồi trên sheet (giả lập bằng cách sửa endDate trong devtools) → sau 30s auto remove.
  - [ ] Admin: confirm apply dialog mở, thay đổi product → confirm → drift toast hiện.

### Task 24: Update CLAUDE.md (project-level) with new architecture note

- [ ] **Step 1: Append to `app/order-ui/CLAUDE.md`**

```md
### Voucher display state

Voucher sheets render via `IVoucherDisplay` produced by `mergeVoucherSources` (eligible ∪ applied snapshot).
Each row's behavior is decided by `getVoucherDisplayState` (pure function in `src/lib/voucher-display.ts`).
Applied vouchers that drop out of the eligible response stay in the list as `APPLIED_STALE` so the user can
always deselect them. `useAutoRevalidateAppliedVoucher` watches cart/customer/payment/time and auto-removes
invalid applied vouchers with a toast. Do not re-implement validation inside sheets.
```

- [ ] Commit:

```bash
git add app/order-ui/CLAUDE.md
git commit -m "docs(voucher): document display state machine architecture"
```

---

## Self-review checklist (pre-merge)

- [ ] Mỗi case từ phân tích đã có task fix:
  - Case 1 (cart sửa làm minOrder fail) → Task 7+11
  - Case 2 (race remainingUsage) → Task 17 (optimistic rollback) + auto-revalidate
  - Case 3, 4 (expire / time window) → Task 7 polling
  - Case 5, 6 (customer / payment method) → Task 7 context deps
  - Case 7 (maxItems) → Task 3 state machine reason
  - Case 8 (admin disable) → Task 5 (NOT_ELIGIBLE) + Task 11 auto-revalidate
  - Case 9 (multiple voucher in list) → Task 6 (1 nguồn duy nhất, bỏ localVoucherList)
  - Case 10 (SAME_PRICE_PRODUCT mất product) → Task 3 productsOk + Task 7
  - Case 11 (stale on reopen) → Task 9 (sheetOpen → enabled → refetch)
  - Case 12, 14 (confirm dialog) → Task 20-21
  - Case 13, 15 (orphan voucher-product) → Task 6 union + Task 5 NOT_ELIGIBLE reason
  - Case 16 (optimistic mismatch) → Task 17-19
  - Case 18 (reason mơ hồ) → Task 4 + Task 10 reasonMsg
  - **NEW (last usage)** → Task 2 (`applied_only` injection) + Task 22 integration test
- [ ] Không có `TODO` / `TBD` trong code task.
- [ ] Tên hàm/type nhất quán giữa các task (`IVoucherDisplay`, `getVoucherDisplayState`, `mergeVoucherSources`, `useVoucherDisplayList`, `useAutoRevalidateAppliedVoucher`).
- [ ] Mọi commit có prefix `feat|fix|refactor|test|docs(voucher): ...`.
