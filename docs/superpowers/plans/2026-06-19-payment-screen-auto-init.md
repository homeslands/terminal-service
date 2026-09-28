# Payment Screen Auto-Init + UX Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign payment screen — default chuyển khoản với QR auto-init, error retry inline, sticky button context-aware (cash: confirm; transfer: in HĐ tạm), success screen sau khi thanh toán xong.

**Architecture:** `TablePaymentScreen` orchestrate. Khi mount + tab=transfer → check `orderData.payment` trước. Nếu có QR valid → dùng lại; nếu không → fire `initiatePayment`. Init error → error card inline với nút retry. Sticky big button đổi label/action theo tab + state. Left column bỏ button "Hoá đơn tạm" rời, gộp tất cả vào dropdown. Khi polling detect success → render `<PaymentSuccessScreen>` thay panel, có nút navigate về floor plan.

**Tech Stack:** TypeScript, TanStack Query, React, Vitest. BE: `useInitiatePayment`, `useOrderBySlug`, `useGetOrderProvisionalBill`.

---

## File Structure

**Modified (2 files):**
- `src/components/staff/payment-panel.tsx` — context-aware sticky button (cash → confirm; transfer + qrCode → in HĐ tạm; transfer + no qrCode → disabled)
- `src/components/staff/table-payment-screen.tsx` — auto-init useEffect, error state inline, success screen swap, remove "Hoá đơn tạm" left button, default tab = transfer

**Created (1 file):**
- `src/components/staff/payment-success-screen.tsx` — success view sau khi thanh toán xong, button "Về màn bàn"

**Working directory:** `/Users/phanquyetthang/terminal/app/order-ui` (main tree, branch `feature/TT-30-FE-Add-New-User-Roles-and-Implement-Permission-Mapping`).

---

## Task 1: Default tab = transfer

**Files:**
- Modify: `src/components/staff/table-payment-screen.tsx` (tab state init)

- [ ] **Step 1: Find tab state init**

Trong file, tìm:
```ts
const [tab, setTab] = useState<'cash' | 'transfer'>('cash')
```

(Hoặc tương đương — search `useState.*cash` hoặc `useState.*Tab`.)

- [ ] **Step 2: Change initial to transfer**

```ts
const [tab, setTab] = useState<'cash' | 'transfer'>('transfer')
```

- [ ] **Step 3: TS check**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npx tsc -b 2>&1 | head -5
```

Expected: clean.

- [ ] **Step 4: Test regression**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npx vitest run 2>&1 | tail -5
```

Expected: 634/634 pass.

- [ ] **Step 5: Commit**

```bash
git add app/order-ui/src/components/staff/table-payment-screen.tsx
git commit -m "feat(payment): default tab to transfer (chuyển khoản)"
```

---

## Task 2: Auto-init transfer on mount + check existing payment

**Files:**
- Modify: `src/components/staff/table-payment-screen.tsx`

- [ ] **Step 1: Read IPayment shape**

Đọc `src/types/dish.type.ts` tìm `IPayment`. Cần biết các field: `qrCode`, `statusCode`. Init lại chỉ khi:
- `orderData.payment` undefined/null, HOẶC
- `orderData.payment.qrCode` empty, HOẶC
- `orderData.payment.statusCode === 'cancelled'`

Nếu `orderData.payment.qrCode` non-empty và `statusCode === 'pending'` → reuse, set vào local `qrCode` state.

- [ ] **Step 2: Extract triggerInitiateTransfer helper**

Trong `handleConfirm` (~line 530), block `else` (tab transfer) chứa logic `initiatePayment` call. Extract thành function riêng có thể reuse cho mount auto-init + retry:

Thêm trong component body (gần các handler khác):

```ts
const triggerInitiateTransfer = useCallback(() => {
  if (!orderSlug) return
  setInitError(null)
  setIsLoading(true)
  initiatePayment(
    { orderSlug, paymentMethod: PaymentMethod.BANK_TRANSFER },
    {
      onSuccess: (data) => {
        setIsLoading(false)
        if (data.result.qrCode) {
          setQrCode(data.result.qrCode)
        }
        setIsPolling(true)
      },
      onError: (err) => {
        setIsLoading(false)
        const errorObj = err as {
          response?: { data?: { errorCodeValue?: number; message?: string } }
          message?: string
        }
        const code = errorObj?.response?.data?.errorCodeValue
        const msg =
          errorObj?.response?.data?.message ||
          errorObj?.message ||
          tToast('toast.qrCreationFailed')
        if (code) showErrorToast(code)
        else showErrorToastMessage(msg)
        setInitError(msg)
      },
    },
  )
}, [orderSlug, initiatePayment, tToast])
```

`setInitError` state thêm ở Step 3.

- [ ] **Step 3: Add initError state**

Gần các state khác (~line 100-110), thêm:

```ts
const [initError, setInitError] = useState<string | null>(null)
```

- [ ] **Step 4: Replace handleConfirm transfer branch**

Trong `handleConfirm` (~line 530), branch `else` (transfer) hiện inline gọi `initiatePayment`. Thay bằng:

```ts
} else {
  triggerInitiateTransfer()
}
```

(Cash branch giữ nguyên.)

- [ ] **Step 5: Add mount auto-init effect**

Sau các useEffect khác (gần cuối phần state/effect), thêm:

```ts
// Auto-init transfer payment khi mount nếu chưa có QR.
// Check orderData.payment trước — nếu BE đã có sẵn payment pending với qrCode
// thì reuse, không gọi init mới.
const hasTriggeredAutoInit = useRef(false)
useEffect(() => {
  if (hasTriggeredAutoInit.current) return
  if (tab !== 'transfer') return
  if (!orderSlug) return
  if (qrCode) return // local state already has QR
  // Wait for orderData to load
  if (!orderData) return

  hasTriggeredAutoInit.current = true

  const existingPayment = orderData.payment
  const hasReusableQr =
    !!existingPayment?.qrCode &&
    existingPayment.statusCode !== 'cancelled' &&
    existingPayment.statusCode !== 'failed'

  if (hasReusableQr) {
    setQrCode(existingPayment.qrCode)
    setIsPolling(true)
  } else {
    triggerInitiateTransfer()
  }
}, [tab, orderSlug, orderData, qrCode, triggerInitiateTransfer])
```

- [ ] **Step 6: TS check**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npx tsc -b 2>&1 | head -10
```

Expected: clean.

- [ ] **Step 7: Test regression**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npx vitest run 2>&1 | tail -5
```

Expected: 634/634 pass.

- [ ] **Step 8: Commit**

```bash
git add app/order-ui/src/components/staff/table-payment-screen.tsx
git commit -m "feat(payment): auto-init transfer on mount, reuse existing QR from BE"
```

---

## Task 3: Init error UI inline + retry

**Files:**
- Modify: `src/components/staff/table-payment-screen.tsx`
- Modify: `src/components/staff/payment-panel.tsx`

- [ ] **Step 1: Add initError + onRetry props to PaymentPanel**

Trong `src/components/staff/payment-panel.tsx`, extend Props:

```ts
interface Props {
  total: number
  tab: Tab
  onTabChange: (tab: Tab) => void
  onConfirm: () => void
  qrCode?: string
  isLoading?: boolean
  amount: number
  onAmountChange: (amount: number) => void
  customerSlot?: React.ReactNode
  /** Error message hiển thị trong tab transfer khi init payment fail */
  initError?: string | null
  /** Callback khi user click "Thử lại" trên init error card */
  onRetryInit?: () => void
}
```

Destructure trong function signature.

- [ ] **Step 2: Render error card trong TabsContent transfer**

Tìm `<TabsContent value="transfer" ...>` (~line 130-180). Trong tab content:

- Khi `initError` truthy → render error card thay vì QR
- Khi đang loading + chưa có error → render loading state
- Khi qrCode có sẵn → render QR + poll status

```tsx
<TabsContent value="transfer" className="mt-4 flex flex-col gap-4">
  {initError ? (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
      <div className="mb-2 flex items-center gap-2 font-semibold text-destructive">
        <span>⚠</span>
        Lỗi tạo mã thanh toán
      </div>
      <p className="mb-3 text-pos-muted">{initError}</p>
      <Button
        variant="outline"
        size="sm"
        onClick={onRetryInit}
        className="border-destructive text-destructive hover:bg-destructive/10"
      >
        🔄 Thử lại
      </Button>
    </div>
  ) : isLoading && !qrCode ? (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-pos-muted">
      <Loader2 className="h-8 w-8 animate-spin" />
      <span className="text-sm">Đang tạo mã thanh toán...</span>
    </div>
  ) : qrCode ? (
    /* existing QR render block — keep as-is */
    <ExistingQrBlock />
  ) : (
    /* fallback empty state when no init triggered yet */
    null
  )}
</TabsContent>
```

(Verify exact existing QR JSX và keep + Loader2 import từ lucide-react.)

- [ ] **Step 3: Wire from table-payment-screen**

Trong `<PaymentPanel>` JSX (~line 818), pass thêm props:

```tsx
<PaymentPanel
  /* ...existing props */
  initError={initError}
  onRetryInit={triggerInitiateTransfer}
/>
```

- [ ] **Step 4: Reset initError on tab switch to cash**

Trong `onTabChange` handler hoặc `setTab` wrapper, khi switch sang cash → `setInitError(null)`. Trong `table-payment-screen.tsx`, sửa:

```ts
const handleTabChange = (next: 'cash' | 'transfer') => {
  setTab(next)
  if (next === 'cash') setInitError(null)
}
```

Pass `onTabChange={handleTabChange}` thay `setTab` trực tiếp.

- [ ] **Step 5: TS check**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npx tsc -b 2>&1 | head -10
```

Expected: clean.

- [ ] **Step 6: Test regression**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npx vitest run 2>&1 | tail -5
```

Expected: 634/634 pass.

- [ ] **Step 7: Commit**

```bash
git add app/order-ui/src/components/staff/payment-panel.tsx app/order-ui/src/components/staff/table-payment-screen.tsx
git commit -m "feat(payment): inline init error card with retry button"
```

---

## Task 4: Sticky button context-aware (cash → confirm, transfer → in HĐ tạm)

**Files:**
- Modify: `src/components/staff/payment-panel.tsx`

- [ ] **Step 1: Add onPrintProvisional + isPrinting props**

Trong PaymentPanel Props (Task 3 đã add `initError`, `onRetryInit`), thêm:

```ts
/** Callback khi user click "In hoá đơn tạm" (transfer tab sticky button) */
onPrintProvisional?: () => void
/** Loading khi đang gọi BE in HĐ tạm */
isPrinting?: boolean
```

Destructure trong function signature.

- [ ] **Step 2: Update canConfirm + confirmLabel logic**

Tìm block (~line 70-90):

```ts
const canConfirmCash = amount >= total && total > 0
const canConfirmTransfer = !qrCode && total > 0
const canConfirm = tab === 'cash' ? canConfirmCash : canConfirmTransfer
const confirmLabel =
  tab === 'cash'
    ? isLoading ? 'Đang xử lý...' : 'XÁC NHẬN THANH TOÁN'
    : isLoading ? 'Đang tạo QR...' : qrCode ? 'ĐANG CHỜ THANH TOÁN' : 'TẠO MÃ THANH TOÁN'
```

Thay bằng:

```ts
const canConfirmCash = amount >= total && total > 0
const canPrintProvisional = !!qrCode && !isPrinting
const canConfirm = tab === 'cash' ? canConfirmCash : canPrintProvisional

const confirmLabel = (() => {
  if (tab === 'cash') {
    return isLoading ? 'Đang xử lý...' : 'XÁC NHẬN THANH TOÁN'
  }
  // transfer tab
  if (isPrinting) return 'Đang in...'
  if (!qrCode) return 'CHỜ MÃ THANH TOÁN'
  return '🖨 IN HOÁ ĐƠN TẠM'
})()
```

- [ ] **Step 3: Wire confirm action by tab**

Tìm sticky big button onClick (~line 225-235). Hiện gọi `onConfirm()`. Thay bằng:

```tsx
<Button
  onClick={() => {
    if (tab === 'cash') {
      setCashConfirmOpen(true)
    } else {
      onPrintProvisional?.()
    }
  }}
  disabled={!canConfirm || isLoading || isPrinting}
  className="h-14 w-full bg-pos-gold text-base font-bold text-white hover:bg-pos-gold/80 disabled:opacity-40"
>
  {(isLoading || isPrinting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  {confirmLabel}
</Button>
```

- [ ] **Step 4: Wire from table-payment-screen.tsx**

Đã có sẵn `useGetOrderProvisionalBill` (verify import). Pass props:

```tsx
<PaymentPanel
  /* ...existing + Task 3 props */
  onPrintProvisional={() => {
    if (!orderSlug) return
    getOrderProvisionalBill(orderSlug, {
      onSuccess: (data: Blob) => {
        showToast(tToast('toast.exportOrderProvisionalBillSuccess'))
        loadDataToPrinter(data)
      },
    })
  }}
  isPrinting={isPendingGetOrderProvisionalBill}
/>
```

Verify `getOrderProvisionalBill`, `isPendingGetOrderProvisionalBill`, `loadDataToPrinter`, `showToast`, `tToast` đã import.

- [ ] **Step 5: TS check**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npx tsc -b 2>&1 | head -10
```

Expected: clean.

- [ ] **Step 6: Test regression**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npx vitest run 2>&1 | tail -10
```

Expected: tests có thể fail nếu existing PaymentPanel tests assert button label/action cũ. Update tests theo behavior mới — `payment-panel.test.tsx` cần điều chỉnh:
- Test "TẠO MÃ THANH TOÁN" → đổi sang test sticky button trên transfer tab + qrCode = "IN HOÁ ĐƠN TẠM" + click → `onPrintProvisional` called
- Test transfer flow generate QR → giờ là auto-init từ screen, không qua sticky button. Có thể move test sang `table-payment-screen` integration test.

Read `src/tests/components/staff/payment-panel.test.tsx` để update.

- [ ] **Step 7: Commit**

```bash
git add app/order-ui/src/components/staff/payment-panel.tsx app/order-ui/src/components/staff/table-payment-screen.tsx app/order-ui/src/tests/components/staff/payment-panel.test.tsx
git commit -m "feat(payment): sticky button shows 'In hoá đơn tạm' on transfer tab"
```

---

## Task 5: Remove "Hoá đơn tạm" button left + restructure left actions

**Files:**
- Modify: `src/components/staff/table-payment-screen.tsx`

- [ ] **Step 1: Find left column actions**

~line 770-800 có block:

```tsx
<div className="mt-3 flex gap-2">
  <Button variant="outline" size="sm" onClick={() => setShowReceipt(true)} className="flex-1">
    Hoá đơn tạm
  </Button>
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm" aria-label="Thao tác khác">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={() => setShowInvoiceForm(true)}>
        <FileText className="mr-2 h-4 w-4" />
        Xuất hoá đơn
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => setConfirmCancel(true)} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
        <Trash2 className="mr-2 h-4 w-4" />
        Huỷ đơn
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</div>
```

- [ ] **Step 2: Remove "Hoá đơn tạm" Button + flatten dropdown**

Thay bằng (chỉ giữ dropdown, đặt right-align cho thẩm mỹ):

```tsx
<div className="mt-3 flex justify-end">
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm" aria-label="Thao tác khác">
        <MoreHorizontal className="mr-1 h-4 w-4" />
        Thao tác
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={() => setShowInvoiceForm(true)}>
        <FileText className="mr-2 h-4 w-4" />
        Xuất hoá đơn
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => setConfirmCancel(true)}
        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Huỷ đơn
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</div>
```

- [ ] **Step 3: Remove unused `showReceipt` state**

Tìm `const [showReceipt, setShowReceipt] = useState(false)` và `ReceiptDialog` render block (search "showReceipt" trong file). Remove cả:
- State declaration
- Render block `{showReceipt && (<ReceiptDialog ... />)}` (~line 855-862)
- Import `ReceiptDialog` nếu chỉ dùng ở đây (check usage trước khi xoá import)

- [ ] **Step 4: TS check**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npx tsc -b 2>&1 | head -5
```

Expected: clean. Nếu có unused imports warning → remove.

- [ ] **Step 5: Test regression**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npx vitest run 2>&1 | tail -5
```

Expected: 634/634 pass (hoặc fewer nếu PaymentPanel tests update — Task 4 đã handle).

- [ ] **Step 6: Commit**

```bash
git add app/order-ui/src/components/staff/table-payment-screen.tsx
git commit -m "refactor(payment): consolidate left actions into single dropdown"
```

---

## Task 6: Payment success screen

**Files:**
- Create: `src/components/staff/payment-success-screen.tsx`
- Modify: `src/components/staff/table-payment-screen.tsx`

- [ ] **Step 1: Create PaymentSuccessScreen component**

Tạo file mới `src/components/staff/payment-success-screen.tsx`:

```tsx
import { Check } from 'lucide-react'
import { Button } from '@/components/ui'
import { formatVnd } from '@/data/staff-data'

interface Props {
  tableName: string
  total: number
  paymentMethod: 'cash' | 'transfer'
  /** Khoản tiền khách đưa (chỉ relevant với cash) */
  amount?: number
  /** Tiền thừa trả khách (chỉ relevant với cash) */
  change?: number
  /** Cashier click để về floor plan */
  onBackToFloor: () => void
}

export function PaymentSuccessScreen({
  tableName,
  total,
  paymentMethod,
  amount,
  change,
  onBackToFloor,
}: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-pos-card p-8 text-pos-text">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20">
        <Check className="h-12 w-12 text-emerald-600" strokeWidth={3} />
      </div>

      <div className="text-center">
        <h1 className="text-2xl font-bold text-pos-text">
          Thanh toán thành công
        </h1>
        <p className="mt-1 text-sm text-pos-muted">
          Bàn {tableName} ·{' '}
          {paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}
        </p>
      </div>

      <div className="w-full max-w-sm space-y-3 rounded-lg border border-pos-border bg-pos-surface p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-pos-muted">Tổng thu</span>
          <span className="text-xl font-bold text-pos-gold">
            {formatVnd(total)}
          </span>
        </div>
        {paymentMethod === 'cash' && amount != null && (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-pos-muted">Khách đưa</span>
              <span className="text-sm font-semibold">{formatVnd(amount)}</span>
            </div>
            {change != null && change > 0 && (
              <div className="flex items-baseline justify-between border-t border-pos-border pt-2">
                <span className="text-sm text-pos-muted">Tiền trả lại</span>
                <span className="text-sm font-bold text-pos-gold">
                  {formatVnd(change)}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <Button
        onClick={onBackToFloor}
        className="h-12 w-full max-w-sm bg-pos-gold text-base font-bold text-white hover:bg-pos-gold/80"
      >
        ← VỀ MÀN BÀN
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Add success state + render switch in table-payment-screen**

Trong `table-payment-screen.tsx`:

Thêm state gần các state khác:
```ts
const [isPaid, setIsPaid] = useState(false)
```

Trong `handlePaymentSuccess` (~line 489), thay `navigate(...)` (nếu có) bằng `setIsPaid(true)`:

```ts
const handlePaymentSuccess = useCallback(() => {
  setIsPolling(false)
  stopPolling()
  setIsPaid(true)
  showToast(tToast('toast.paymentSuccess'))
}, [stopPolling, tToast])
```

(Verify existing logic — có thể navigate `onPaymentSuccess?.()` callback. Skip navigation, chỉ set `isPaid`.)

Tại đầu return JSX, swap render:

```tsx
if (isPaid && session) {
  return (
    <PaymentSuccessScreen
      tableName={session.tableName}
      total={totalWithDiscount}
      paymentMethod={tab}
      amount={tab === 'cash' ? amount : undefined}
      change={tab === 'cash' && amount > totalWithDiscount ? amount - totalWithDiscount : undefined}
      onBackToFloor={() => {
        if (onPaymentSuccess) {
          onPaymentSuccess()
        } else {
          navigate('/staff')
        }
      }}
    />
  )
}
```

(Verify `onPaymentSuccess` prop và navigate path. Nếu prop callback xử lý navigate thì gọi nó; nếu không thì hard-coded `/staff` floor plan.)

Import:
```ts
import { PaymentSuccessScreen } from '@/components/staff/payment-success-screen'
```

- [ ] **Step 3: TS check**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npx tsc -b 2>&1 | head -10
```

Expected: clean.

- [ ] **Step 4: Test regression**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npx vitest run 2>&1 | tail -5
```

Expected: 634/634 pass.

- [ ] **Step 5: Prettier**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npx prettier --write src/components/staff/payment-success-screen.tsx src/components/staff/table-payment-screen.tsx src/components/staff/payment-panel.tsx
```

- [ ] **Step 6: Commit**

```bash
git add app/order-ui/src/components/staff/payment-success-screen.tsx app/order-ui/src/components/staff/table-payment-screen.tsx app/order-ui/src/components/staff/payment-panel.tsx
git commit -m "feat(payment): success screen after payment confirmed"
```

---

## Task 7: Manual smoke test

**Files:** None modified.

- [ ] **Step 1: Start dev server**

```bash
cd /Users/phanquyetthang/terminal/app/order-ui && npm run dev
```

- [ ] **Step 2: Test auto-init flow**

1. Login admin/cashier role
2. Đặt 1 đơn ở bàn → submit → click THANH TOÁN
3. Payment screen mở → verify:
   - Default tab = "🏦 CHUYỂN KHOẢN"
   - Auto-fire `POST /payment/initiate?paymentMethod=BANK_TRANSFER` (xem Network)
   - QR loading spinner trong vài giây
   - QR render khi BE response success
   - Sticky bottom button: "🖨 IN HOÁ ĐƠN TẠM" (gold, enabled)
4. Click "In Hoá Đơn Tạm" → spinner trên button → BE response → toast success + printer dialog mở

- [ ] **Step 3: Test init error retry**

1. Tắt network hoặc mock BE return error (DevTools → Network → Block URL pattern `/payment/initiate`)
2. Refresh payment screen → auto-init fails
3. Verify: error card hiển thị "⚠ Lỗi tạo mã thanh toán" + button "🔄 Thử lại"
4. Bật lại network → click "Thử lại" → init fires lại → QR render thành công

- [ ] **Step 4: Test existing payment reuse**

1. Có payment screen với QR đã tạo
2. Refresh tab (F5) → screen mount lại
3. Verify: KHÔNG fire init mới (Network không thấy `POST /payment/initiate`)
4. QR cũ từ `orderData.payment.qrCode` hiển thị ngay

- [ ] **Step 5: Test cash flow**

1. Payment screen → click tab "💵 TIỀN MẶT"
2. Sticky button đổi label → "XÁC NHẬN THANH TOÁN"
3. Nhập tiền khách đưa = 300k (giả sử total 250k)
4. Click sticky button → modal "Xác nhận thanh toán" hiện với tổng + khách đưa + trả lại
5. Click "Hoàn tất" → BE `POST /payment/initiate?paymentMethod=CASH` → success
6. Verify: **PaymentSuccessScreen render** với Tổng thu 250k, Khách đưa 300k, Trả lại 50k + button "← VỀ MÀN BÀN"
7. Click button → navigate về `/staff` (floor plan)

- [ ] **Step 6: Test transfer success polling**

1. Vào payment screen mới, QR auto-render
2. Mock customer pay (giả lập BE) hoặc đợi BE poll tự thấy paid
3. Verify: PaymentSuccessScreen render với Tổng thu, không có Khách đưa/Trả lại (vì transfer)
4. Click "VỀ MÀN BÀN" → navigate `/staff`

- [ ] **Step 7: Test left dropdown**

1. Trong payment screen, verify cột trái chỉ có dropdown "⋯ Thao tác" (không còn nút "Hoá đơn tạm" rời)
2. Click dropdown → 2 mục: "Xuất hoá đơn", "Huỷ đơn"
3. Click "Xuất hoá đơn" → invoice form mở
4. Click "Huỷ đơn" → confirm dialog → cancel order flow

---

## Self-Review

**Spec coverage:**
- ✅ Default tab transfer — Task 1
- ✅ Auto-init on mount + check existing payment — Task 2
- ✅ Init error inline + retry — Task 3
- ✅ Sticky button context-aware (cash confirm, transfer print HĐ tạm) — Task 4
- ✅ Remove "Hoá đơn tạm" left button — Task 5
- ✅ Success screen + navigate cashier-controlled — Task 6
- ✅ Manual smoke test — Task 7

**Placeholder scan:**
- "verify existing QR JSX và keep" trong Task 3 Step 2 — implementer phải đọc code hiện tại, nhưng plan đưa đủ pattern. Không phải placeholder mà là instruction để adapt.
- "Verify `getOrderProvisionalBill`..." trong Task 4 Step 4 — yêu cầu implementer check imports đã có. Acceptable.
- Mọi step có code cụ thể.

**Type consistency:**
- `initError: string | null` consistent Task 2/3
- `onPrintProvisional?: () => void` + `isPrinting?: boolean` consistent Task 4
- `isPaid: boolean` Task 6
- PaymentPanel Props extension: `initError`, `onRetryInit`, `onPrintProvisional`, `isPrinting` — tất cả optional để không break existing tests

**Edge cases addressed:**
- `hasTriggeredAutoInit` ref guard tránh init nhiều lần khi orderData refetch
- Tab switch reset initError
- Transfer tab khi không có qrCode → button disabled
- Cash flow giữ nguyên modal confirm + success screen
