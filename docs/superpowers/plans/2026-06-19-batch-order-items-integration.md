# Batch Order Items Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay loop N round-trips `POST /order-items` bằng 1 call `POST /order-items/batch` khi user thêm nhiều món pending vào đơn đã đặt — gửi 1 chef ticket duy nhất thay vì N tickets.

**Architecture:** API + hook `addNewMultipleOrderItems` / `useAddNewMultipleOrderItems` đã tồn tại trong code nhưng URL + body **không khớp BE**. Fix API contract, thêm field `note` vào `IAddNewOrderItemRequest`, rồi swap loop `addOrderItemAsync` bằng 1 call `addMultipleAsync` trong cả 2 cart panels (admin + staff). Flow tăng/giảm quantity của row đã submit giữ nguyên (không động).

**Tech Stack:** TypeScript, TanStack Query, React, Vitest. BE endpoint `POST /order-items/batch`.

---

## File Structure

**Modified (4 files):**
- `src/types/dish.type.ts` — thêm `note?: string` vào `IAddNewOrderItemRequest`
- `src/api/order.ts` — fix `addNewMultipleOrderItems` URL + body shape
- `src/components/staff/table-order-screen.tsx` — replace loop bằng batch trong `handleSubmitOrder`
- `src/app/system/menu/components/admin-cart-content.tsx` — same pattern

**Test (1 file):**
- `src/tests/api/order.test.ts` — extend với test cho `addNewMultipleOrderItems` URL + body

**Working directory:** `/Users/phanquyetthang/terminal/app/order-ui` (main tree, branch `feature/TT-30-FE-Add-New-User-Roles-and-Implement-Permission-Mapping`).

---

## Task 1: Update `IAddNewOrderItemRequest` type — thêm field `note`

**Files:**
- Modify: `src/types/dish.type.ts:385-391`

- [ ] **Step 1: Edit type**

Tìm interface `IAddNewOrderItemRequest` ở line ~385:

```ts
export interface IAddNewOrderItemRequest {
  quantity: number
  variant: string
  promotion: string
  order: string
  customPrice?: number
}
```

Thêm field `note?: string`:

```ts
export interface IAddNewOrderItemRequest {
  quantity: number
  note?: string
  variant: string
  promotion: string
  order: string
  customPrice?: number
}
```

- [ ] **Step 2: TS check**

Run:
```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npx tsc -b 2>&1 | head -5
```

Expected: clean (no output, exit 0).

- [ ] **Step 3: Commit**

```bash
git add app/order-ui/src/types/dish.type.ts
git commit -m "feat(order): add optional note field to IAddNewOrderItemRequest"
```

---

## Task 2: Fix `addNewMultipleOrderItems` API URL + body shape

**Files:**
- Modify: `src/api/order.ts:201-209`
- Test: `src/tests/api/order.test.ts`

- [ ] **Step 1: Write failing test**

Append vào `src/tests/api/order.test.ts`:

```ts
describe('addNewMultipleOrderItems', () => {
  it('POST /order-items/batch with {orderItems} body and note field', async () => {
    const mockResponse = {
      message: 'ok',
      statusCode: 200,
      result: { slug: 'order-1', orderItems: [] },
    }
    const postSpy = vi
      .spyOn(http, 'post')
      .mockResolvedValueOnce({ data: mockResponse } as never)

    const items = [
      {
        quantity: 2,
        note: 'Không đường',
        variant: 'v1',
        promotion: '',
        order: 'order-1',
      },
      {
        quantity: 1,
        variant: 'v2',
        promotion: 'promo-1',
        order: 'order-1',
        customPrice: 50000,
      },
    ]

    const result = await addNewMultipleOrderItems(items)

    expect(postSpy).toHaveBeenCalledWith('/order-items/batch', {
      orderItems: items,
    })
    expect(result).toEqual(mockResponse)
  })
})
```

Đảm bảo import sẵn ở top file:

```ts
import { addNewMultipleOrderItems } from '@/api/order'
import http from '@/utils/http'
import { describe, expect, it, vi } from 'vitest'
```

(Adapt imports cho khớp existing pattern của file — đọc 20 dòng đầu test file trước khi thêm.)

- [ ] **Step 2: Run failing test**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npx vitest run src/tests/api/order.test.ts -t "addNewMultipleOrderItems"
```

Expected: FAIL — URL hiện tại là `/{orderSlug}/order-items/batch`, body wrapper `{ items }` không match assertion.

- [ ] **Step 3: Fix API implementation**

Trong `src/api/order.ts` tìm `addNewMultipleOrderItems` (~line 201):

```ts
export async function addNewMultipleOrderItems(
  items: IAddNewOrderItemRequest[],
): Promise<IApiResponse<IOrder>> {
  const response = await http.post<IApiResponse<IOrder>>(
    `/${items[0].order}/order-items/batch`,
    { items },
  )
  return response.data
}
```

Thay bằng:

```ts
export async function addNewMultipleOrderItems(
  items: IAddNewOrderItemRequest[],
): Promise<IApiResponse<IOrder>> {
  const response = await http.post<IApiResponse<IOrder>>(
    `/order-items/batch`,
    { orderItems: items },
  )
  return response.data
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npx vitest run src/tests/api/order.test.ts -t "addNewMultipleOrderItems"
```

Expected: PASS.

- [ ] **Step 5: TS check + regression**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npx tsc -b 2>&1 | head -5
cd /Users/phanquyetthang/terminal/app/order-ui && npx vitest run src/tests/api/order.test.ts 2>&1 | tail -5
```

Expected: TS clean. All order.test.ts pass.

- [ ] **Step 6: Commit**

```bash
git add app/order-ui/src/api/order.ts app/order-ui/src/tests/api/order.test.ts
git commit -m "fix(api): correct addNewMultipleOrderItems URL + body shape"
```

---

## Task 3: Integrate batch trong `table-order-screen.tsx` `handleSubmitOrder`

**Files:**
- Modify: `src/components/staff/table-order-screen.tsx`

- [ ] **Step 1: Add hook import**

Trong destructure imports từ `@/hooks` (~line 22-34), thêm `useAddNewMultipleOrderItems`:

```ts
import {
  // ... existing hooks
  useAddNewMultipleOrderItems,
  // ... rest
} from '@/hooks'
```

(Verify import shape thực tế — có thể file dùng named imports khác nhau. Match the style.)

- [ ] **Step 2: Add hook call inside component**

Sau dòng:
```ts
const { mutateAsync: addOrderItemAsync, isPending: isAddingOrderItem } = useAddNewOrderItem()
```

Thêm:
```ts
const { mutateAsync: addMultipleAsync } = useAddNewMultipleOrderItems()
```

- [ ] **Step 3: Replace loop bằng batch call**

Tìm `handleSubmitOrder` (~line 290), trong block `else` (khi `currentSession.orderSlug` truthy). Hiện tại:

```ts
} else {
  const apiItems = currentSession.pendingItems.filter(
    (item) => item.variantSlug,
  )
  for (const item of apiItems) {
    const data = await addOrderItemAsync(
      buildAddOrderItemPayload(item, currentSession.orderSlug),
    )
    // Backfill the API slug for this specific item
    setPendingItemOrderItemSlug(id, item.variantSlug!, data.result.slug)
  }
  showToast('Đã cập nhật đơn')
}
```

Thay bằng:

```ts
} else {
  const apiItems = currentSession.pendingItems.filter(
    (item) => item.variantSlug,
  )
  if (apiItems.length === 0) {
    showToast('Đã cập nhật đơn')
  } else {
    const payload = apiItems.map((item) =>
      buildAddOrderItemPayload(item, currentSession.orderSlug!),
    )
    const data = await addMultipleAsync(payload)
    // Backfill orderItemSlug — match BE returned orderItems with local pendingItems by variant slug.
    // BE batch endpoint returns 1 IOrder with full orderItems[] (cả cũ + mới),
    // nên chỉ pick các item mới được thêm (trong apiItems gốc).
    const newSlugSet = new Set(apiItems.map((i) => i.variantSlug))
    for (const apiItem of data.result.orderItems) {
      if (newSlugSet.has(apiItem.variant.slug)) {
        setPendingItemOrderItemSlug(id, apiItem.variant.slug, apiItem.slug)
      }
    }
    showToast('Đã cập nhật đơn')
  }
}
```

**Concern**: nếu pending có 2 items cùng variantSlug (vd 2 cốc cùng món), backfill sẽ ghi đè cho row đầu tiên match. Acceptable vì pending merge theo variant — không có duplicate variant trong pending. Verify bằng cách đọc `buildCreateOrderItems` / `buildAddOrderItemPayload` behavior.

- [ ] **Step 4: TS check**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npx tsc -b 2>&1 | head -10
```

Expected: clean.

- [ ] **Step 5: Regression tests**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npx vitest run 2>&1 | tail -10
```

Expected: 633/633 pass (baseline).

- [ ] **Step 6: Commit**

```bash
git add app/order-ui/src/components/staff/table-order-screen.tsx
git commit -m "feat(staff): use batch endpoint when adding items to existing order"
```

---

## Task 4: Integrate batch trong `admin-cart-content.tsx` `handleSubmitOrder`

**Files:**
- Modify: `src/app/system/menu/components/admin-cart-content.tsx`

- [ ] **Step 1: Add hook import**

Tìm destructure imports từ `@/hooks` (~line 33-44), thêm `useAddNewMultipleOrderItems`:

```ts
import {
  // ... existing hooks
  useAddNewMultipleOrderItems,
  // ... rest
} from '@/hooks'
```

- [ ] **Step 2: Add hook call**

Sau dòng:
```ts
const { mutateAsync: addOrderItemAsync, isPending: isAddingOrderItem } = useAddNewOrderItem()
```

Thêm:
```ts
const { mutateAsync: addMultipleAsync } = useAddNewMultipleOrderItems()
```

- [ ] **Step 3: Replace loop bằng batch call**

Tìm `handleSubmitOrder` (~line 380), trong block `else` (khi `session.orderSlug` truthy). Hiện tại:

```ts
} else {
  const apiItems = pending.filter((i) => i.variantSlug)
  for (const item of apiItems) {
    const data = await addOrderItemAsync({
      quantity: item.quantity,
      variant: item.variantSlug!,
      promotion: item.promotion?.slug ?? '',
      order: session.orderSlug,
    })
    setPendingItemOrderItemSlug(
      tableSlug,
      item.variantSlug!,
      data.result.slug,
    )
  }
}
```

Thay bằng:

```ts
} else {
  const apiItems = pending.filter((i) => i.variantSlug)
  if (apiItems.length > 0) {
    const payload = apiItems.map((item) => ({
      quantity: item.quantity,
      note: item.note ?? '',
      variant: item.variantSlug!,
      promotion: item.promotion?.slug ?? '',
      order: session.orderSlug!,
      ...(item.isCustomPrice && item.customPrice != null
        ? { customPrice: item.customPrice }
        : {}),
    }))
    const data = await addMultipleAsync(payload)
    const newVariantSet = new Set(apiItems.map((i) => i.variantSlug))
    for (const apiItem of data.result.orderItems) {
      if (newVariantSet.has(apiItem.variant.slug)) {
        setPendingItemOrderItemSlug(
          tableSlug,
          apiItem.variant.slug,
          apiItem.slug,
        )
      }
    }
  }
}
```

(Note: dùng `buildAddOrderItemPayload` nếu file admin đã import — verify. Nếu không, viết inline như trên.)

- [ ] **Step 4: TS check**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npx tsc -b 2>&1 | head -10
```

Expected: clean.

- [ ] **Step 5: Full regression**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npx vitest run 2>&1 | tail -10
```

Expected: 633/633 pass.

- [ ] **Step 6: Prettier**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npx prettier --write src/types/dish.type.ts src/api/order.ts src/components/staff/table-order-screen.tsx src/app/system/menu/components/admin-cart-content.tsx
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add app/order-ui/src/app/system/menu/components/admin-cart-content.tsx
git commit -m "feat(admin): use batch endpoint when adding items to existing order"
```

---

## Task 5: Manual smoke test

**Files:** None modified.

- [ ] **Step 1: Start dev server**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npm run dev
```

- [ ] **Step 2: Test staff flow**

1. Login role STAFF
2. Mở `/staff` → chọn 1 bàn trống
3. Add 3 món vào cart (pending)
4. Click **ĐẶT MÓN** — verify Network: `POST /orders` (CASE A, first-time) → BE trả 1 order với 3 items
5. Add tiếp 2 món mới vào cart (pending)
6. Click **ĐẶT MÓN** lần 2 — verify Network: `POST /order-items/batch` (CASE B, batch) với body `{ orderItems: [item1, item2] }`
7. Check ticket bếp: 1 ticket cho lượt 2 (không phải 2 tickets riêng)

- [ ] **Step 3: Test admin flow**

1. Login role ADMIN
2. Mở `/system/menu?tab=table` → chọn 1 bàn
3. Add 2 món pending → ĐẶT MÓN — verify `POST /orders`
4. Add 3 món pending lần 2 → ĐẶT MÓN — verify `POST /order-items/batch` với body `{ orderItems: [...3 items] }`

- [ ] **Step 4: Test increment qty 1 row (vẫn dùng endpoint cũ)**

1. Ở 1 bàn đã có submitted items
2. Click "Xem chi tiết" → tăng qty 1 món từ 2 → 3 (chỉ 1 row)
3. Click Xác nhận — verify Network: `POST /order-items` (single, không batch) — endpoint cũ vẫn dùng cho case +1 trên 1 row

- [ ] **Step 5: Test decrement qty (vẫn dùng endpoint cũ)**

1. Submitted dialog → giảm qty 1 món từ 3 → 1
2. Verify Network: `PATCH /order-items/{slug}` với body chứa `action: 'decrement'`, `note`, `promotion` (đã fix ở task trước)

- [ ] **Step 6: Verify chef order**

In thủ công 1 chef order với batch — confirm BE tạo **1 chef order** cho lượt batch (theo mô tả endpoint "print one chef order"), thay vì N orders riêng.

---

## Self-Review

**Spec coverage:**
- ✅ Fix URL + body shape `addNewMultipleOrderItems` — Task 2
- ✅ Add `note` field — Task 1
- ✅ Integrate vào staff flow — Task 3
- ✅ Integrate vào admin flow — Task 4
- ✅ Giữ nguyên flow quantity edit (update/delete single + addNewOrderItem single increment) — không có task động vào (test ở Task 5 step 4-5)
- ✅ Verify chef order behavior — Task 5 step 6

**Placeholder scan:**
- Không có TODO/TBD/placeholder
- Tất cả steps có code cụ thể hoặc command rõ ràng
- `buildAddOrderItemPayload` reference trong Task 3 — đã có sẵn trong codebase tại `src/lib/staff-order-payload.ts`, không cần redefine
- Admin Task 4 dùng inline shape thay vì `buildAddOrderItemPayload` vì file admin có thể không import helper này — implementer verify, nếu có thì dùng helper

**Type consistency:**
- `IAddNewOrderItemRequest.note?: string` thêm Task 1, dùng ở Task 3 + Task 4
- `addMultipleAsync` shape: `(items: IAddNewOrderItemRequest[]) => Promise<IApiResponse<IOrder>>` consistent qua API → hook → caller
- `data.result.orderItems` shape: `IOrderDetail[]` — match cấu trúc `IOrder.orderItems` đã defined trong `dish.type.ts:235`
