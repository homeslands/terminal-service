# Admin/Staff Custom-Price Order Flow — Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đảm bảo flow admin/staff hỗ trợ đầy đủ món giá tuỳ chỉnh (custom-price): (1) truyền `customPrice` lên BE khi tạo order và khi thêm order item; (2) enforce invariant "1 đơn chỉ chứa custom-price HOẶC chỉ chứa món thường, không mix"; (3) mỗi sản phẩm custom-price chỉ tồn tại 1 lần trong giỏ.

**Architecture:** Đặt guard ở store-level (`useTableSessionsStore.addItem`) — single source of truth, đối xứng với guard đã có trong `useOrderFlowStore` (client side). Guard check cả `pendingItems` lẫn `submittedOrders` (đại diện cho các item đã push lên BE). Đổi signature `addItem` → trả về `boolean` để UI biết khi nào guard reject và không show success toast. Tầng API payload (`admin-cart-content.tsx`, `table-order-screen.tsx`) — bổ sung field `customPrice` vào `createOrder.orderItems[]` và `addNewOrderItem` payloads. Update-order flow đã đúng (đi qua `useOrderFlowStore.addDraftItem` + `staff-confirm-update-order-dialog.tsx:187`).

**Tech Stack:** React 18, TypeScript, Zustand, TanStack Query v5, Vitest, react-i18next.

**Working dir for all paths:** `/Users/phanquyetthang/terminal/app/order-ui`

---

## File structure

### Modify
- `src/stores/table-sessions.store.ts` — `addItem` đổi signature trả `boolean`, thêm 2 guard.
- `src/app/system/menu/components/admin-cart-content.tsx` — 3 call sites: createOrder (~L308), addOrderItem (~L324), addOrderItem qty-increase (~L405). Bổ sung `customPrice`.
- `src/components/staff/table-order-screen.tsx` — 3 call sites: createOrder (~L262), addOrderItem (~L279), addOrderItem qty-increase (~L351). Bổ sung `customPrice`.
- `src/app/system/menu/components/system-menus.tsx` — `handleAddToCart` (~L52) respect `addItem` return.

### Test files (create new)
- `src/tests/stores/table-sessions-custom-price.test.ts` — unit tests cho 2 guard mới.
- `src/tests/components/staff/table-order-screen-custom-price.test.tsx` — integration test cho call site mới.

### Touched indirectly (verify, no code change expected)
- `src/types/dish.type.ts` — `ICreateOrderRequest.orderItems[].customPrice` và `IAddNewOrderItemRequest.customPrice` đã khai báo optional, không đổi.
- `src/app/system/menu/components/system-menus-in-update-order.tsx` — đã đúng (gọi `useOrderFlowStore.addDraftItem` có sẵn guard); không sửa.
- `src/components/app/dialog/staff-confirm-update-order-dialog.tsx:187` — đã pass `customPrice` đúng; không sửa.

---

## Conventions

- TDD nghiêm ngặt: viết test fail → minimal code → test pass → commit.
- Branch: `feature/TT-XX-FE-admin-staff-custom-price` (cut từ `main`). Replace `TT-XX` với task id thực tế khi tạo branch.
- Commit prefix theo project: `feat`, `fix`, `test`, `refactor`. Format: `TaskId: TT-XX (N) <short message>` (theo style của repo, xem `git log`).
- Run single test: `npx vitest run <path>`. Lint trước commit: `npm run lint`.
- Toast keys đã có sẵn: `toast.cannotMixCustomPriceItems`, `toast.customPriceItemAlreadyInCart`, `toast.cannotAddItemToAnOrderContainsCustomPriceProduct`. Không cần thêm key mới.

---

## Phase 1 — Store guards in `useTableSessionsStore.addItem`

### Task 1: Update store API type — `addItem` returns boolean

**Files:**
- Modify: `src/stores/table-sessions.store.ts`

- [ ] **Step 1: Locate the type declaration**

Read `src/stores/table-sessions.store.ts`. The store interface contains `addItem: (tableId: string, item: OrderItem) => void`. We will change it to `=> boolean` (true = added, false = guard rejected).

- [ ] **Step 2: Update the interface signature**

Find the type definition (search for `addItem:`) and change:

```ts
addItem: (tableId: string, item: OrderItem) => void
```

to:

```ts
addItem: (tableId: string, item: OrderItem) => boolean
```

- [ ] **Step 3: Run typecheck to surface call sites**

Run: `cd app/order-ui && npx tsc -b --noEmit 2>&1 | grep -E "addItem|table-sessions"`
Expected: TypeScript errors listing call sites (system-menus.tsx, system-menus-in-update-order.tsx if it exists, table-order-screen.tsx, tests). These confirm what must change in later tasks.

Do not fix them yet — Phase 2 handles UI; Phase 1.4 handles the implementation return values.

- [ ] **Step 4: Commit**

```bash
git add app/order-ui/src/stores/table-sessions.store.ts
git commit -m "$(cat <<'EOF'
TaskId: TT-XX (1) Change useTableSessionsStore.addItem signature to return boolean

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Tests for the "no-mix custom + regular" guard (TDD red)

**Files:**
- Create: `src/tests/stores/table-sessions-custom-price.test.ts`

- [ ] **Step 1: Write failing test for no-mix against pendingItems**

```ts
// src/tests/stores/table-sessions-custom-price.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTableSessionsStore } from '@/stores/table-sessions.store'

vi.mock('@/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils')>()
  return { ...actual, showErrorToastMessage: vi.fn() }
})

import { showErrorToastMessage } from '@/utils'

const tableId = 't1'

const regularItem = (over?: Partial<Parameters<typeof useTableSessionsStore.getState>['addItem']>) => ({
  menuItemId: 'reg-1',
  name: 'Regular',
  priceNum: 50_000,
  price: '50.000đ',
  quantity: 1,
  note: '',
  variantSlug: 'v-reg-1',
  productSlug: 'p-reg-1',
  isCustomPrice: false,
  promotion: null,
  vatRate: 0,
  ...over,
})

const customItem = (over?: Partial<ReturnType<typeof regularItem>>) => ({
  ...regularItem(),
  menuItemId: 'cp-1',
  customPriceId: 'cp-uuid-1',
  name: 'Custom',
  priceNum: 100_000,
  price: '100.000đ',
  productSlug: 'p-cp-1',
  isCustomPrice: true,
  ...over,
})

describe('useTableSessionsStore.addItem — custom-price guards', () => {
  beforeEach(() => {
    useTableSessionsStore.setState({ sessions: {} })
    vi.mocked(showErrorToastMessage).mockClear()
    useTableSessionsStore.getState().openSession(tableId, 'Bàn 1')
  })

  it('blocks adding regular item when pending has custom-price item', () => {
    const added1 = useTableSessionsStore.getState().addItem(tableId, customItem())
    expect(added1).toBe(true)

    const added2 = useTableSessionsStore.getState().addItem(tableId, regularItem())
    expect(added2).toBe(false)
    expect(showErrorToastMessage).toHaveBeenCalledWith('toast.cannotMixCustomPriceItems')

    const session = useTableSessionsStore.getState().sessions[tableId]
    expect(session.pendingItems).toHaveLength(1)
    expect(session.pendingItems[0].isCustomPrice).toBe(true)
  })

  it('blocks adding custom-price item when pending has regular item', () => {
    useTableSessionsStore.getState().addItem(tableId, regularItem())

    const added = useTableSessionsStore.getState().addItem(tableId, customItem())
    expect(added).toBe(false)
    expect(showErrorToastMessage).toHaveBeenCalledWith('toast.cannotMixCustomPriceItems')
  })
})
```

- [ ] **Step 2: Run the test — confirm it fails**

Run: `cd app/order-ui && npx vitest run src/tests/stores/table-sessions-custom-price.test.ts`
Expected: Tests FAIL — `addItem` currently returns void and has no guard.

- [ ] **Step 3: Commit the failing tests**

```bash
git add app/order-ui/src/tests/stores/table-sessions-custom-price.test.ts
git commit -m "$(cat <<'EOF'
TaskId: TT-XX (2) Add failing tests for no-mix custom-price guard in table-sessions store

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Implement no-mix guard (against pendingItems + submittedOrders)

**Files:**
- Modify: `src/stores/table-sessions.store.ts`

- [ ] **Step 1: Replace the `addItem` implementation**

Locate the current `addItem` (around L92–119, identified by the comment-free body returning `set((state) => patchSession(...))`). Replace it with:

```ts
addItem: (tableId, item) => {
  let success = true

  set((state) => {
    const session = state.sessions[tableId]
    if (!session) {
      success = false
      return state
    }

    // Pool of items that count for the no-mix invariant:
    // pending (this session, not yet sent) + already-submitted (mirrors BE state).
    const existingItems = [
      ...session.pendingItems,
      ...session.submittedOrders.flatMap((o) => o.items),
    ]

    // Guard 1: no-mix custom-price + regular trong cùng đơn.
    if (existingItems.length > 0) {
      const incomingIsCustom = !!item.isCustomPrice
      const existingHasCustom = existingItems.some((i) => i.isCustomPrice)
      const existingHasRegular = existingItems.some((i) => !i.isCustomPrice)

      // Có cả 2 loại trong existing là state không hợp lệ (chỉ xảy ra với data legacy).
      // Vẫn block hành động hiện tại để không làm tệ hơn.
      if (incomingIsCustom && existingHasRegular) {
        showErrorToastMessage('toast.cannotAddItemToAnOrderContainsCustomPriceProduct')
        success = false
        return state
      }
      if (!incomingIsCustom && existingHasCustom) {
        showErrorToastMessage('toast.cannotMixCustomPriceItems')
        success = false
        return state
      }
    }

    // Guard 2: mỗi sản phẩm custom-price chỉ được 1 trong giỏ.
    if (item.isCustomPrice) {
      const productKey = item.productSlug ?? item.menuItemId
      const duplicate = existingItems.some(
        (i) => i.isCustomPrice && ((i.productSlug ?? i.menuItemId) === productKey),
      )
      if (duplicate) {
        showErrorToastMessage('toast.customPriceItemAlreadyInCart')
        success = false
        return state
      }
    }

    // (Existing logic — custom-price luôn append; regular thì merge theo menuItemId.)
    if (item.isCustomPrice) {
      return patchSession(state, tableId, (s) => ({
        ...s,
        pendingItems: [...s.pendingItems, item],
      }))
    }

    return patchSession(state, tableId, (s) => {
      const existing = s.pendingItems.find((p) => p.menuItemId === item.menuItemId)
      const pendingItems = existing
        ? s.pendingItems.map((p) =>
            p.menuItemId === item.menuItemId
              ? {
                  ...p,
                  quantity: p.quantity + item.quantity,
                  promotion: item.promotion,
                  priceNum: item.priceNum,
                  originalPrice: item.originalPrice,
                  vatRate: item.vatRate,
                  price: item.price,
                }
              : p,
          )
        : [...s.pendingItems, item]
      return { ...s, pendingItems }
    })
  })

  return success
},
```

Make sure `showErrorToastMessage` is imported at the top of the file. If not present, add:

```ts
import { showErrorToastMessage } from '@/utils'
```

- [ ] **Step 2: Run the guard tests — confirm pass**

Run: `cd app/order-ui && npx vitest run src/tests/stores/table-sessions-custom-price.test.ts`
Expected: PASS.

- [ ] **Step 3: Run existing store tests — confirm no regression**

Run: `cd app/order-ui && npx vitest run src/tests/stores/table-sessions-add-item.test.ts src/tests/stores/table-sessions-voucher.test.ts`
Expected: PASS (regular merge behaviour preserved).

- [ ] **Step 4: Commit**

```bash
git add app/order-ui/src/stores/table-sessions.store.ts
git commit -m "$(cat <<'EOF'
TaskId: TT-XX (3) Implement no-mix custom-price guard in table-sessions.addItem

Why: admin/staff side never enforced the invariant, allowing payloads that mix
custom-price and regular items in the same order. Guard checks pendingItems +
submittedOrders so the rule survives across submit cycles within a session.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Tests + implementation for "1 custom-price per product" guard

The implementation in Task 3 already includes Guard 2. This task adds the test coverage.

**Files:**
- Modify: `src/tests/stores/table-sessions-custom-price.test.ts`

- [ ] **Step 1: Add tests for duplicate custom-price guard**

Append to the existing describe block in `src/tests/stores/table-sessions-custom-price.test.ts`:

```ts
  it('blocks adding the same custom-price product twice', () => {
    const a = useTableSessionsStore.getState().addItem(tableId, customItem({
      customPriceId: 'cp-uuid-A',
      priceNum: 100_000,
    }))
    expect(a).toBe(true)

    const b = useTableSessionsStore.getState().addItem(tableId, customItem({
      customPriceId: 'cp-uuid-B',
      priceNum: 200_000, // different price, same productSlug
    }))
    expect(b).toBe(false)
    expect(showErrorToastMessage).toHaveBeenCalledWith('toast.customPriceItemAlreadyInCart')

    const session = useTableSessionsStore.getState().sessions[tableId]
    expect(session.pendingItems).toHaveLength(1)
  })

  it('allows adding different custom-price products', () => {
    const a = useTableSessionsStore.getState().addItem(tableId, customItem({
      productSlug: 'p-cp-A',
      menuItemId: 'cp-A',
    }))
    const b = useTableSessionsStore.getState().addItem(tableId, customItem({
      productSlug: 'p-cp-B',
      menuItemId: 'cp-B',
    }))
    expect(a).toBe(true)
    expect(b).toBe(true)

    const session = useTableSessionsStore.getState().sessions[tableId]
    expect(session.pendingItems).toHaveLength(2)
  })

  it('also enforces no-mix against submittedOrders (not just pending)', () => {
    // Submit a custom-price item first, so it moves to submittedOrders
    useTableSessionsStore.getState().addItem(tableId, customItem())
    useTableSessionsStore.getState().submitOrder(tableId)

    const session1 = useTableSessionsStore.getState().sessions[tableId]
    expect(session1.pendingItems).toHaveLength(0)
    expect(session1.submittedOrders[0].items).toHaveLength(1)

    // Now try to add a regular item — must be blocked.
    const added = useTableSessionsStore.getState().addItem(tableId, regularItem())
    expect(added).toBe(false)
    expect(showErrorToastMessage).toHaveBeenCalledWith('toast.cannotMixCustomPriceItems')
  })
```

- [ ] **Step 2: Run — confirm pass**

Run: `cd app/order-ui && npx vitest run src/tests/stores/table-sessions-custom-price.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add app/order-ui/src/tests/stores/table-sessions-custom-price.test.ts
git commit -m "$(cat <<'EOF'
TaskId: TT-XX (4) Cover qty=1 + submittedOrders branches of custom-price guards

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — UI respects `addItem` boolean return

### Task 5: Fix `system-menus.tsx` success toast on guard reject

**Files:**
- Modify: `src/app/system/menu/components/system-menus.tsx` (around L91)

- [ ] **Step 1: Locate `handleAddToCart`**

Read `src/app/system/menu/components/system-menus.tsx` lines 50–95. The function currently calls `addItem(activeTableSlug, orderItem)` then unconditionally `showToast(tToast('toast.addSuccess'))`.

- [ ] **Step 2: Gate the success toast on the return value**

Change:

```ts
addItem(activeTableSlug, orderItem)
showToast(tToast('toast.addSuccess'))
```

to:

```ts
const added = addItem(activeTableSlug, orderItem)
if (added) showToast(tToast('toast.addSuccess'))
```

(Guards already show their own error toast.)

- [ ] **Step 3: Typecheck**

Run: `cd app/order-ui && npx tsc -b --noEmit 2>&1 | grep -E "system-menus"`
Expected: no errors related to this file.

- [ ] **Step 4: Commit**

```bash
git add app/order-ui/src/app/system/menu/components/system-menus.tsx
git commit -m "$(cat <<'EOF'
TaskId: TT-XX (5) Gate add-to-cart success toast on table-session guard result

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Fix `table-order-screen.tsx` success toast on guard reject

**Files:**
- Modify: `src/components/staff/table-order-screen.tsx` (around L220–223)

- [ ] **Step 1: Locate `handleAdd`**

Read lines 218–225 of `src/components/staff/table-order-screen.tsx`. Currently:

```ts
const handleAdd = (item: Omit<OrderItem, 'note'>) => {
  addItem(id, { ...item, note: '' })
  showToast(`Đã thêm ${item.name}`)
}
```

- [ ] **Step 2: Respect the return value**

Replace with:

```ts
const handleAdd = (item: Omit<OrderItem, 'note'>) => {
  const added = addItem(id, { ...item, note: '' })
  if (added) showToast(`Đã thêm ${item.name}`)
}
```

- [ ] **Step 3: Typecheck**

Run: `cd app/order-ui && npx tsc -b --noEmit 2>&1 | grep -E "table-order-screen"`
Expected: no errors related to this file.

- [ ] **Step 4: Commit**

```bash
git add app/order-ui/src/components/staff/table-order-screen.tsx
git commit -m "$(cat <<'EOF'
TaskId: TT-XX (6) Gate handleAdd success toast on table-session guard result

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Send `customPrice` in API payloads

### Task 7: `admin-cart-content.tsx` — createOrder payload

**Files:**
- Modify: `src/app/system/menu/components/admin-cart-content.tsx` (L308–315)

- [ ] **Step 1: Locate the createOrder call**

Read lines 299–315. The `orderItems` mapping currently omits `customPrice`:

```ts
orderItems: apiItems.map((item) => ({
  quantity: item.quantity,
  variant: item.variantSlug!,
  promotion: item.promotion?.slug ?? null,
  note: item.note || '',
})),
```

- [ ] **Step 2: Include customPrice when item is custom-priced**

Replace with:

```ts
orderItems: apiItems.map((item) => ({
  quantity: item.quantity,
  variant: item.variantSlug!,
  // Custom-price items never carry promotion (BE guard mirrors client guard).
  promotion: item.isCustomPrice ? null : (item.promotion?.slug ?? null),
  note: item.note || '',
  ...(item.isCustomPrice && (item.priceNum ?? 0) > 0
    ? { customPrice: item.priceNum }
    : {}),
})),
```

(`item.priceNum` is the canonical price field on the session OrderItem; for custom-price items it equals the value entered via `CustomPriceDialog`.)

- [ ] **Step 3: Verify typecheck**

Run: `cd app/order-ui && npx tsc -b --noEmit 2>&1 | grep admin-cart-content`
Expected: no errors. `ICreateOrderRequest.orderItems[].customPrice` is already declared optional in `src/types/dish.type.ts:378`.

- [ ] **Step 4: Commit**

```bash
git add app/order-ui/src/app/system/menu/components/admin-cart-content.tsx
git commit -m "$(cat <<'EOF'
TaskId: TT-XX (7) Send customPrice when admin creates a new order

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `admin-cart-content.tsx` — addOrderItem (new item to existing order)

**Files:**
- Modify: `src/app/system/menu/components/admin-cart-content.tsx` (L323–331)

- [ ] **Step 1: Locate the addOrderItemAsync call**

Lines 322–331 currently:

```ts
} else {
  for (const item of apiItems) {
    const data = await addOrderItemAsync({
      quantity: item.quantity,
      variant: item.variantSlug!,
      promotion: item.promotion?.slug ?? '',
      order: session.orderSlug,
    })
    setPendingItemOrderItemSlug(tableSlug, item.variantSlug!, data.result.slug)
  }
}
```

- [ ] **Step 2: Include customPrice**

Replace the inner `addOrderItemAsync({...})` argument with:

```ts
const data = await addOrderItemAsync({
  quantity: item.quantity,
  variant: item.variantSlug!,
  promotion: item.isCustomPrice ? '' : (item.promotion?.slug ?? ''),
  order: session.orderSlug,
  ...(item.isCustomPrice && (item.priceNum ?? 0) > 0
    ? { customPrice: item.priceNum }
    : {}),
})
```

- [ ] **Step 3: Typecheck**

Run: `cd app/order-ui && npx tsc -b --noEmit 2>&1 | grep admin-cart-content`
Expected: no errors. `IAddNewOrderItemRequest.customPrice` is declared optional in `src/types/dish.type.ts:390`.

- [ ] **Step 4: Commit**

```bash
git add app/order-ui/src/app/system/menu/components/admin-cart-content.tsx
git commit -m "$(cat <<'EOF'
TaskId: TT-XX (8) Send customPrice when admin appends item to existing order

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `admin-cart-content.tsx` — addOrderItem (quantity-increase branch)

**Files:**
- Modify: `src/app/system/menu/components/admin-cart-content.tsx` (~L398–415)

- [ ] **Step 1: Locate the quantity-increase call**

Lines 398–415. The branch fires when `newQty > currentTotal` for a submitted item. Currently:

```ts
const variantSlug = items[0]?.variantSlug ?? ''
const meta = session.submittedOrders
  .flatMap((o) => o.items)
  .find((i) => i.menuItemId === menuItemId && i.note === note)
if (!meta) continue
const data = await addOrderItemAsync({
  quantity: newQty - currentTotal,
  variant: variantSlug,
  promotion: meta.promotion?.slug ?? '',
  order: session.orderSlug,
})
```

- [ ] **Step 2: Pull `isCustomPrice` + `priceNum` from `meta` (the submitted OrderItem)**

Both fields exist on the session `OrderItem` type (`src/types/session.ts:10,14`). Replace the `addOrderItemAsync({...})` call with:

```ts
const data = await addOrderItemAsync({
  quantity: newQty - currentTotal,
  variant: variantSlug,
  promotion: meta.isCustomPrice ? '' : (meta.promotion?.slug ?? ''),
  order: session.orderSlug,
  ...(meta.isCustomPrice && (meta.priceNum ?? 0) > 0
    ? { customPrice: meta.priceNum }
    : {}),
})
```

- [ ] **Step 3: Important — verify guard 2 (qty=1) is consistent**

Custom-price items have `qty = 1` and the guard in Task 3 prevents duplicates. If this branch executes for an `isCustomPrice` item, it implies someone is trying to set qty > 1 on a custom-price submitted item — that's a UX path that should be blocked separately. For this task, we still send the payload correctly so the BE receives the price; UX-level blocking lives in `SubmittedOrdersDialog` and is **out of scope**. Leave a one-line comment so future reviewers understand:

Add this single-line comment immediately above the `addOrderItemAsync` call in this branch:

```ts
// Custom-price items in submittedOrders should keep qty=1; UX gate lives in SubmittedOrdersDialog.
```

- [ ] **Step 4: Typecheck**

Run: `cd app/order-ui && npx tsc -b --noEmit 2>&1 | grep admin-cart-content`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/order-ui/src/app/system/menu/components/admin-cart-content.tsx
git commit -m "$(cat <<'EOF'
TaskId: TT-XX (9) Send customPrice on quantity-increase path in admin cart

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: `table-order-screen.tsx` — createOrder payload

**Files:**
- Modify: `src/components/staff/table-order-screen.tsx` (L253–269)

- [ ] **Step 1: Locate `handleSubmitOrder`**

Read lines 247–290. The `createOrderAsync` `orderItems` mapping omits `customPrice`:

```ts
orderItems: apiItems.map((item) => ({
  quantity: item.quantity,
  variant: item.variantSlug!,
  promotion: item.promotion?.slug ?? null,
  note: item.note || '',
})),
```

- [ ] **Step 2: Replace with customPrice-aware mapping**

```ts
orderItems: apiItems.map((item) => ({
  quantity: item.quantity,
  variant: item.variantSlug!,
  promotion: item.isCustomPrice ? null : (item.promotion?.slug ?? null),
  note: item.note || '',
  ...(item.isCustomPrice && (item.priceNum ?? 0) > 0
    ? { customPrice: item.priceNum }
    : {}),
})),
```

- [ ] **Step 3: Typecheck**

Run: `cd app/order-ui && npx tsc -b --noEmit 2>&1 | grep table-order-screen`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/order-ui/src/components/staff/table-order-screen.tsx
git commit -m "$(cat <<'EOF'
TaskId: TT-XX (10) Send customPrice when staff creates an order from a table

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: `table-order-screen.tsx` — addOrderItem (new item)

**Files:**
- Modify: `src/components/staff/table-order-screen.tsx` (L277–288)

- [ ] **Step 1: Locate the call**

Lines 277–288:

```ts
} else {
  for (const item of apiItems) {
    const data = await addOrderItemAsync({
      quantity: item.quantity,
      variant: item.variantSlug!,
      promotion: item.promotion?.slug ?? '',
      order: currentSession.orderSlug,
    })
    setPendingItemOrderItemSlug(id, item.variantSlug!, data.result.slug)
  }
  showToast('Đã cập nhật đơn')
}
```

- [ ] **Step 2: Add customPrice**

Replace the `addOrderItemAsync({...})` argument with:

```ts
const data = await addOrderItemAsync({
  quantity: item.quantity,
  variant: item.variantSlug!,
  promotion: item.isCustomPrice ? '' : (item.promotion?.slug ?? ''),
  order: currentSession.orderSlug,
  ...(item.isCustomPrice && (item.priceNum ?? 0) > 0
    ? { customPrice: item.priceNum }
    : {}),
})
```

- [ ] **Step 3: Typecheck**

Run: `cd app/order-ui && npx tsc -b --noEmit 2>&1 | grep table-order-screen`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/order-ui/src/components/staff/table-order-screen.tsx
git commit -m "$(cat <<'EOF'
TaskId: TT-XX (11) Send customPrice when staff appends item to existing order

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: `table-order-screen.tsx` — addOrderItem (quantity-increase branch)

**Files:**
- Modify: `src/components/staff/table-order-screen.tsx` (L344–367)

- [ ] **Step 1: Locate the branch**

Lines 344–367. Currently:

```ts
} else if (newQty > currentTotal) {
  const variantSlug = items[0]?.variantSlug ?? ''
  const meta = currentSession.submittedOrders
    .flatMap((o) => o.items)
    .find((i) => i.menuItemId === menuItemId && i.note === note)
  if (!meta) continue
  const data = await addOrderItemAsync({
    quantity: newQty - currentTotal,
    variant: variantSlug,
    promotion: meta.promotion?.slug ?? '',
    order: currentSession.orderSlug!,
  })
  addSubmittedOrderItem(id, {
    menuItemId,
    variantSlug,
    orderItemSlug: data.result.slug,
    name: meta.name,
    priceNum: meta.priceNum,
    price: meta.price,
    note,
    quantity: newQty - currentTotal,
  })
}
```

- [ ] **Step 2: Add customPrice + comment**

Replace the `addOrderItemAsync({...})` argument with:

```ts
// Custom-price items in submittedOrders should keep qty=1; UX gate lives in SubmittedOrdersDialog.
const data = await addOrderItemAsync({
  quantity: newQty - currentTotal,
  variant: variantSlug,
  promotion: meta.isCustomPrice ? '' : (meta.promotion?.slug ?? ''),
  order: currentSession.orderSlug!,
  ...(meta.isCustomPrice && (meta.priceNum ?? 0) > 0
    ? { customPrice: meta.priceNum }
    : {}),
})
```

- [ ] **Step 3: Propagate isCustomPrice into the submitted item record**

`useTableSessionsStore.addSubmittedOrderItem` accepts a full `OrderItem` (signature at `src/stores/table-sessions.store.ts:53`), and `OrderItem` already carries `isCustomPrice` (`src/types/session.ts:14`). The current call builds a partial record — add `isCustomPrice` so subsequent UI checks (badge, future qty-guard) keep working:

```ts
addSubmittedOrderItem(id, {
  menuItemId,
  variantSlug,
  orderItemSlug: data.result.slug,
  name: meta.name,
  priceNum: meta.priceNum,
  price: meta.price,
  note,
  quantity: newQty - currentTotal,
  isCustomPrice: !!meta.isCustomPrice,
})
```

- [ ] **Step 4: Typecheck**

Run: `cd app/order-ui && npx tsc -b --noEmit 2>&1 | grep table-order-screen`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/order-ui/src/components/staff/table-order-screen.tsx
git commit -m "$(cat <<'EOF'
TaskId: TT-XX (12) Send customPrice on quantity-increase path in staff table screen

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Integration smoke tests + final verification

### Task 13: Extract `buildCreateOrderItems` pure helper + unit test

The createOrder `orderItems` mapping is identical in `admin-cart-content.tsx` (Task 7) and `table-order-screen.tsx` (Task 10). DRY it into a pure helper and unit-test that — avoids the heavy component-render harness while still pinning down the payload shape.

**Files:**
- Create: `src/lib/staff-order-payload.ts`
- Create: `src/tests/lib/staff-order-payload.test.ts`
- Modify: `src/app/system/menu/components/admin-cart-content.tsx` (use helper)
- Modify: `src/components/staff/table-order-screen.tsx` (use helper)

- [ ] **Step 1: Write the failing test first**

Create `src/tests/lib/staff-order-payload.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildCreateOrderItems } from '@/lib/staff-order-payload'
import type { OrderItem } from '@/types'

const base: OrderItem = {
  menuItemId: 'm-1',
  name: 'X',
  priceNum: 50_000,
  price: '50.000đ',
  quantity: 2,
  note: 'less ice',
  variantSlug: 'v-1',
  productSlug: 'p-1',
  promotion: null,
  vatRate: 0,
}

describe('buildCreateOrderItems', () => {
  it('maps a regular item with promotion preserved', () => {
    const result = buildCreateOrderItems([
      { ...base, promotion: { slug: 'promo-1', value: 10 } },
    ])
    expect(result).toEqual([
      {
        quantity: 2,
        variant: 'v-1',
        promotion: 'promo-1',
        note: 'less ice',
      },
    ])
  })

  it('maps a regular item without promotion → promotion: null', () => {
    const result = buildCreateOrderItems([base])
    expect(result[0].promotion).toBeNull()
    expect(result[0]).not.toHaveProperty('customPrice')
  })

  it('maps a custom-price item with customPrice from priceNum + drops promotion', () => {
    const result = buildCreateOrderItems([
      {
        ...base,
        isCustomPrice: true,
        priceNum: 123_000,
        // promotion deliberately set — helper must strip it for custom-price items
        promotion: { slug: 'should-be-stripped', value: 10 },
      },
    ])
    expect(result[0]).toEqual({
      quantity: 2,
      variant: 'v-1',
      promotion: null,
      note: 'less ice',
      customPrice: 123_000,
    })
  })

  it('omits customPrice if isCustomPrice but priceNum is 0', () => {
    const result = buildCreateOrderItems([
      { ...base, isCustomPrice: true, priceNum: 0 },
    ])
    expect(result[0]).not.toHaveProperty('customPrice')
  })

  it('filters out items missing variantSlug', () => {
    const result = buildCreateOrderItems([
      base,
      { ...base, variantSlug: '' },
      { ...base, variantSlug: undefined },
    ])
    expect(result).toHaveLength(1)
  })
})
```

Run: `cd app/order-ui && npx vitest run src/tests/lib/staff-order-payload.test.ts`
Expected: FAIL — module `@/lib/staff-order-payload` does not exist.

- [ ] **Step 2: Implement the helper**

Create `src/lib/staff-order-payload.ts`:

```ts
import type { OrderItem } from '@/types'

export interface CreateOrderItemPayload {
  quantity: number
  variant: string
  promotion: string | null
  note: string
  customPrice?: number
}

/**
 * Build the orderItems array for POST /orders from session OrderItems.
 * Filters out items missing variantSlug. For custom-price items, drops the
 * promotion and attaches customPrice from priceNum (when > 0).
 */
export function buildCreateOrderItems(items: OrderItem[]): CreateOrderItemPayload[] {
  return items
    .filter((item) => item.variantSlug)
    .map((item) => {
      const isCustom = !!item.isCustomPrice
      const hasCustomPrice = isCustom && (item.priceNum ?? 0) > 0
      return {
        quantity: item.quantity,
        variant: item.variantSlug!,
        promotion: isCustom ? null : (item.promotion?.slug ?? null),
        note: item.note || '',
        ...(hasCustomPrice ? { customPrice: item.priceNum } : {}),
      }
    })
}

export interface AddOrderItemPayload {
  quantity: number
  variant: string
  promotion: string
  order: string
  customPrice?: number
}

/**
 * Build the payload for POST /order-items from a single session OrderItem.
 * Symmetric to buildCreateOrderItems for the per-item endpoint.
 */
export function buildAddOrderItemPayload(
  item: OrderItem,
  orderSlug: string,
  quantityOverride?: number,
): AddOrderItemPayload {
  const isCustom = !!item.isCustomPrice
  const hasCustomPrice = isCustom && (item.priceNum ?? 0) > 0
  return {
    quantity: quantityOverride ?? item.quantity,
    variant: item.variantSlug!,
    promotion: isCustom ? '' : (item.promotion?.slug ?? ''),
    order: orderSlug,
    ...(hasCustomPrice ? { customPrice: item.priceNum } : {}),
  }
}
```

Run: `cd app/order-ui && npx vitest run src/tests/lib/staff-order-payload.test.ts`
Expected: PASS.

- [ ] **Step 3: Add tests for `buildAddOrderItemPayload`**

Append to `src/tests/lib/staff-order-payload.test.ts`:

```ts
import { buildAddOrderItemPayload } from '@/lib/staff-order-payload'

describe('buildAddOrderItemPayload', () => {
  it('builds payload for a regular item with promotion', () => {
    const out = buildAddOrderItemPayload(
      { ...base, promotion: { slug: 'promo-1', value: 10 } },
      'order-slug-1',
    )
    expect(out).toEqual({
      quantity: 2,
      variant: 'v-1',
      promotion: 'promo-1',
      order: 'order-slug-1',
    })
  })

  it('builds payload for a custom-price item with customPrice', () => {
    const out = buildAddOrderItemPayload(
      { ...base, isCustomPrice: true, priceNum: 99_000 },
      'order-slug-1',
    )
    expect(out).toEqual({
      quantity: 2,
      variant: 'v-1',
      promotion: '',
      order: 'order-slug-1',
      customPrice: 99_000,
    })
  })

  it('respects quantityOverride for qty-increase branch', () => {
    const out = buildAddOrderItemPayload(base, 'order-slug-1', 5)
    expect(out.quantity).toBe(5)
  })
})
```

Run: `cd app/order-ui && npx vitest run src/tests/lib/staff-order-payload.test.ts`
Expected: All tests PASS.

- [ ] **Step 4: Refactor `admin-cart-content.tsx` to use the helpers**

In `src/app/system/menu/components/admin-cart-content.tsx`:

- Add import near the other `@/lib/...` imports:

```ts
import { buildCreateOrderItems, buildAddOrderItemPayload } from '@/lib/staff-order-payload'
```

- Replace the createOrder branch (touched in Task 7) — replace the `apiItems.filter` + `orderItems: apiItems.map((item) => ({...}))` mapping with:

```ts
const orderItemsPayload = buildCreateOrderItems(pending)
if (orderItemsPayload.length === 0) return

if (!session.orderSlug) {
  const data = await createOrderAsync({
    type: OrderTypeEnum.AT_TABLE,
    table: tableSlug,
    branch: userInfo?.branch?.slug ?? '',
    owner: userInfo?.slug ?? '',
    approvalBy: userInfo?.slug ?? '',
    description: session.description ?? '',
    orderItems: orderItemsPayload,
    voucher: null,
  })
  // ...rest unchanged
}
```

- In the addOrderItem branch (Task 8): replace the inline payload object with `buildAddOrderItemPayload(item, session.orderSlug)`. The `for (const item of apiItems)` loop still needs `apiItems` — derive it as `const apiItems = pending.filter((i) => i.variantSlug)` if you prefer, OR iterate over the original `pending` and let the helper filter at the array-level builder. Pick one and stay consistent.

- In the qty-increase branch (Task 9): replace inline payload with `buildAddOrderItemPayload(meta, session.orderSlug, newQty - currentTotal)`.

- [ ] **Step 5: Refactor `table-order-screen.tsx` symmetrically**

In `src/components/staff/table-order-screen.tsx`:

- Add import:

```ts
import { buildCreateOrderItems, buildAddOrderItemPayload } from '@/lib/staff-order-payload'
```

- Replace the three call sites identified in Tasks 10–12 with helper invocations following the same pattern as Step 4.

- [ ] **Step 6: Run typecheck + the new test + existing test suites**

Run:
```bash
cd app/order-ui && npx tsc -b --noEmit
cd app/order-ui && npx vitest run src/tests/lib/staff-order-payload.test.ts src/tests/stores/table-sessions-custom-price.test.ts src/tests/stores/table-sessions-add-item.test.ts
```
Expected: 0 type errors. All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add app/order-ui/src/lib/staff-order-payload.ts \
        app/order-ui/src/tests/lib/staff-order-payload.test.ts \
        app/order-ui/src/app/system/menu/components/admin-cart-content.tsx \
        app/order-ui/src/components/staff/table-order-screen.tsx
git commit -m "$(cat <<'EOF'
TaskId: TT-XX (13) Extract staff order payload helpers + tests

Why: createOrder/addOrderItem payload shape is identical between admin cart
and table-order-screen. Helper centralizes the custom-price encoding rules
(isCustomPrice → strip promotion, attach customPrice when priceNum > 0).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

> Note for the executor: Tasks 7–12 wrote out the inline payload first deliberately so the diff in those commits is reviewable in isolation. This task replaces those inlines with the helper. If you'd prefer fewer commits, you may collapse Tasks 7–12 into the helper extraction directly — but only after their tests are green, and only if the reviewer prefers that.

---

### Task 14: Full type + lint + test pass

- [ ] **Step 1: Typecheck**

Run: `cd app/order-ui && npx tsc -b --noEmit`
Expected: 0 errors.

- [ ] **Step 2: Lint**

Run: `cd app/order-ui && npm run lint`
Expected: 0 errors. Address any new warnings introduced by these tasks.

- [ ] **Step 3: All tests**

Run: `cd app/order-ui && npm run test`
Expected: PASS. If pre-existing failures exist on `main`, confirm those are not from this branch — diff `git log main..HEAD -- src/tests` if unsure.

- [ ] **Step 4: Manual QA checklist (record results in PR description)**

Run dev server: `cd app/order-ui && npm run dev`

Verify each scenario in browser:
1. Staff at a table — add a regular product → success toast → submit order → BE receives no `customPrice` (existing behavior).
2. Staff at a table — add a custom-price product → enter price in dialog → submit order → BE receives `customPrice` in the orderItem.
3. Staff at a table with a regular item pending — try to add a custom-price product → toast `Cannot mix custom price products with regular products in the same order` → no item added.
4. Staff at a table with a custom-price item pending — try to add a regular product → toast `Cannot add regular product to an order that already contains a custom price product` → no item added.
5. Staff adds custom-price A (e.g. 100k) → add custom-price A again (e.g. 200k) → toast `Each custom price product can only appear once in the cart` → only the first remains.
6. Admin cart (system/menu) — repeat scenarios 1–5 above using the admin entry point.
7. Order detail page (`/system/order-management/<slug>`) — verify the custom-price item shows the customer-set price (already verified; this is regression check).
8. Update-order flow (`/system/update-order/<slug>`) — add a custom-price item via draft → confirm dialog sends `customPrice` to BE (this code path already correct in `staff-confirm-update-order-dialog.tsx:187`; regression check).

- [ ] **Step 5: Open the PR**

Use the project's existing PR convention (see `git log --oneline -20`). PR title: `fix: admin/staff custom-price order flow`. PR body: include the manual QA checklist with checkmarks, link the audit summary, and reference the no-mix invariant as the new behavior.

---

## Out of scope (track separately)

- `src/components/app/dialog/client-confirm-update-order-dialog.tsx:188-193` — client-side update-order flow has the same payload gap (missing `customPrice`). User scope was admin/staff; file a follow-up.
- `SubmittedOrdersDialog` UX guard for qty>1 on submitted custom-price items — out of scope; comments left in Tasks 9 + 12 mark the spot.
- Backend validation of the no-mix invariant — not in this plan; FE guards only. If BE doesn't yet enforce, file a server-side task.
