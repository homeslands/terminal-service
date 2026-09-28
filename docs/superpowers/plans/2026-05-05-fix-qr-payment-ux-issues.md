# QR Payment Flow — Fix UX Issues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 bugs in the QR/RFID coin payment flow: double `updatePaymentMethod` call when voucher is present, missing frontend guard for unauthenticated POINT confirm, and QR badge disappearing after page reload.

**Architecture:** All fixes are in the FE payment layer. Task 1 cleans up a logic bug in `payment-page.tsx`. Task 2 adds a derived boolean guard to the confirm button in `payment-page.tsx`. Task 3 threads an `initialQrToken` prop from `payment-page.tsx` → `StaffPaymentMethodSelect` → `StaffPaymentMethodRadioGroup` so the badge can be restored from persistent store state.

**Tech Stack:** React, TypeScript, Zustand (persist to localStorage), TanStack Query

---

## File Structure

- Modify: `app/order-ui/src/app/system/payment/payment-page.tsx`
  - Task 1: fix `handleSelectPaymentMethod` if/else
  - Task 2: add `isPointReady` guard on confirm button
  - Task 3: pass `initialQrToken={paymentData?.qrToken}` to `StaffPaymentMethodSelect`
- Modify: `app/order-ui/src/components/app/select/staff-payment-method-select.tsx`
  - Task 3: add `initialQrToken?: string` prop, pass to radio group
- Modify: `app/order-ui/src/components/app/radio/staff-payment-method-radio-group.tsx`
  - Task 3: add `initialQrToken?: string` prop, init state + sync effect

---

## Task 1: Fix double `updatePaymentMethod` call in `handleSelectPaymentMethod`

**Problem:** The original `if (voucher) { validate } else { update }` structure was commented out to only its middle — leaving `validateVoucherPaymentMethod` always running AND `updatePaymentMethod` unconditionally running after it. This means:
- When voucher IS present: the store gets updated twice (once in success callback, once unconditionally)
- `setPendingPaymentMethod(undefined)` runs immediately even while async validation is in flight

**Files:**
- Modify: `app/order-ui/src/app/system/payment/payment-page.tsx`

- [ ] **Step 1: Replace `handleSelectPaymentMethod` body**

Current code (lines ~413-438) — the if/else was commented out. Replace the entire block from after the `return` (isMethodDisabled guard) to the end of the function with:

```typescript
    if (voucher?.slug) {
      validateVoucherPaymentMethod(
        { slug: voucher.slug, paymentMethod: selectedPaymentMethod },
        {
          onSuccess: () => {
            updatePaymentMethod(selectedPaymentMethod, transactionId, qrToken)
            setPendingPaymentMethod(undefined)
            setPreviousPaymentMethod(undefined)
            setIsLoading(false)
          },
          onError: () => {
            setPendingPaymentMethod(undefined)
            setIsRemoveVoucherOption(true)
            setIsLoading(false)
          },
        }
      )
    } else {
      updatePaymentMethod(selectedPaymentMethod, transactionId, qrToken)
      setPendingPaymentMethod(undefined)
      setPreviousPaymentMethod(undefined)
      setIsLoading(false)
    }
```

The full function after edit:

```typescript
  const handleSelectPaymentMethod = (selectedPaymentMethod: PaymentMethod, transactionId?: string, qrToken?: string) => {
    setPreviousPaymentMethod(paymentMethod as PaymentMethod)
    setPendingPaymentMethod(selectedPaymentMethod)

    const isMethodDisabled = disabledMethods.includes(selectedPaymentMethod)
    if (isMethodDisabled) {
      if (!isRemoveVoucherOption) {
        setIsRemoveVoucherOption(true)
      }
      setIsLoading(false)
      return
    }

    if (voucher?.slug) {
      validateVoucherPaymentMethod(
        { slug: voucher.slug, paymentMethod: selectedPaymentMethod },
        {
          onSuccess: () => {
            updatePaymentMethod(selectedPaymentMethod, transactionId, qrToken)
            setPendingPaymentMethod(undefined)
            setPreviousPaymentMethod(undefined)
            setIsLoading(false)
          },
          onError: () => {
            setPendingPaymentMethod(undefined)
            setIsRemoveVoucherOption(true)
            setIsLoading(false)
          },
        }
      )
    } else {
      updatePaymentMethod(selectedPaymentMethod, transactionId, qrToken)
      setPendingPaymentMethod(undefined)
      setPreviousPaymentMethod(undefined)
      setIsLoading(false)
    }
  }
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
cd app/order-ui && npm run build 2>&1 | grep -E "error|✓ built"
```

Expected: `✓ built in Xs`

- [ ] **Step 3: Manual test — no voucher path**

Open payment page for an order with NO voucher. Select BANK_TRANSFER → select POINT → scan QR. Verify QR badge appears and confirm button works.

- [ ] **Step 4: Manual test — with voucher path**

Open payment page for an order WITH a voucher compatible with POINT. Select POINT → scan QR. Verify badge appears and confirm works.

- [ ] **Step 5: Commit**

```bash
git add app/order-ui/src/app/system/payment/payment-page.tsx
git commit -m "fix: restore if/else in handleSelectPaymentMethod to remove double updatePaymentMethod call"
```

---

## Task 2: Add frontend guard — disable confirm when POINT not authenticated

**Problem:** When user selects POINT payment but hasn't scanned QR or RFID, the confirm button is still enabled. Clicking it makes an API call that will fail. There should be a frontend guard.

**Approach:** Derive `isPointReady` from `paymentData` in the store. Because `updatePaymentMethod` is called only after successful scan (QR sets `paymentData.qrToken`, RFID sets `paymentData.transactionId`), when `paymentData.paymentMethod === POINT` but both are undefined, the user hasn't authenticated yet.

**Files:**
- Modify: `app/order-ui/src/app/system/payment/payment-page.tsx`

- [ ] **Step 1: Add `isPointReady` derived constant**

After the `const isDisabled = !paymentMethod || !slug` line (around line 113), add:

```typescript
const isPointReady =
  paymentData?.paymentMethod !== PaymentMethod.POINT ||
  !!(paymentData?.qrToken || paymentData?.transactionId)
```

This is `true` unless the store says method=POINT with neither token set.

- [ ] **Step 2: Update confirm button `disabled` prop**

Find the confirm button (the one with `onClick={handleConfirmPayment}`, around line 969-976). Change:

```typescript
                  <Button
                    disabled={isDisabled || isPendingInitiatePayment}
                    className="w-fit"
                    onClick={handleConfirmPayment}
                  >
```

To:

```typescript
                  <Button
                    disabled={isDisabled || isPendingInitiatePayment || !isPointReady}
                    className="w-fit"
                    onClick={handleConfirmPayment}
                  >
```

- [ ] **Step 3: Build**

```bash
cd app/order-ui && npm run build 2>&1 | grep -E "error|✓ built"
```

Expected: `✓ built in Xs`

- [ ] **Step 4: Manual test — POINT not authenticated**

Open payment page. Select POINT (dialog opens). Close dialog WITHOUT scanning. Verify the confirm button is disabled.

- [ ] **Step 5: Manual test — POINT authenticated via QR**

Scan QR. Verify confirm button becomes enabled.

- [ ] **Step 6: Manual test — POINT authenticated via RFID**

Verify same with RFID scan.

- [ ] **Step 7: Manual test — switch from POINT to CASH**

After selecting POINT and scanning QR, switch to CASH. Verify confirm button is still enabled (CASH doesn't need auth).

- [ ] **Step 8: Commit**

```bash
git add app/order-ui/src/app/system/payment/payment-page.tsx
git commit -m "fix: disable confirm button when POINT selected but not authenticated via QR or RFID"
```

---

## Task 3: Restore QR badge after page reload

**Problem:** `scannedQrToken` is local React state in `StaffPaymentMethodRadioGroup`. After a page reload, it resets to `''` even though `paymentData.qrToken` is still in localStorage. The badge "Đã quét QR" disappears, even though submitting would still work correctly.

**Fix:** Thread `initialQrToken` prop from `payment-page.tsx` → `StaffPaymentMethodSelect` → `StaffPaymentMethodRadioGroup`. Initialize local state from the prop, and sync when it changes (e.g., after voucher removal re-initializes payment with preserved qrToken).

**Files:**
- Modify: `app/order-ui/src/components/app/radio/staff-payment-method-radio-group.tsx`
- Modify: `app/order-ui/src/components/app/select/staff-payment-method-select.tsx`
- Modify: `app/order-ui/src/app/system/payment/payment-page.tsx`

- [ ] **Step 1: Add `initialQrToken` prop to `StaffPaymentMethodRadioGroup`**

In `app/order-ui/src/components/app/radio/staff-payment-method-radio-group.tsx`:

Add to the interface:
```typescript
interface StaffPaymentMethodRadioGroupProps {
  order?: IOrder
  defaultValue: string | null
  disabledMethods?: PaymentMethod[]
  disabledReasons?: Record<PaymentMethod, string>
  onSubmit?: (paymentMethod: PaymentMethod, transactionId?: string, qrToken?: string) => void
  initialQrToken?: string
}
```

Add to destructured props:
```typescript
export default function StaffPaymentMethodRadioGroup({
  order,
  defaultValue,
  disabledMethods,
  disabledReasons,
  onSubmit,
  initialQrToken,
}: StaffPaymentMethodRadioGroupProps) {
```

Change state initialization to use the prop:
```typescript
  const [scannedQrToken, setScannedQrToken] = useState<string>(initialQrToken ?? '')
```

Add a sync effect immediately after the state declaration (after `useState` for `scannedQrToken`):
```typescript
  useEffect(() => {
    if (initialQrToken && !scannedQrToken) {
      setScannedQrToken(initialQrToken)
    }
  }, [initialQrToken])
```

This effect handles the case where `initialQrToken` arrives late (e.g., after store hydration) or changes (e.g., after voucher removal re-initializes with preserved qrToken).

- [ ] **Step 2: Add `initialQrToken` prop to `StaffPaymentMethodSelect`**

In `app/order-ui/src/components/app/select/staff-payment-method-select.tsx`:

Add to the interface:
```typescript
interface PaymentMethodSelectProps {
  order?: IOrder
  paymentMethod: PaymentMethod[]
  defaultMethod: PaymentMethod | null
  disabledMethods: PaymentMethod[]
  disabledReasons?: Record<PaymentMethod, string>
  qrCode?: string
  total?: number
  onSubmit?: (paymentMethod: PaymentMethod, transactionId?: string, qrToken?: string) => void
  initialQrToken?: string
}
```

Add to destructured props:
```typescript
export default function StaffPaymentMethodSelect({
  order,
  paymentMethod,
  defaultMethod,
  disabledMethods,
  disabledReasons,
  qrCode,
  total,
  onSubmit,
  initialQrToken,
}: PaymentMethodSelectProps) {
```

Pass to the radio group:
```typescript
            <StaffPaymentMethodRadioGroup
              order={order}
              defaultValue={defaultMethod}
              disabledMethods={disabledMethods}
              disabledReasons={disabledReasons}
              onSubmit={onSubmit}
              initialQrToken={initialQrToken}
            />
```

- [ ] **Step 3: Pass `initialQrToken` from `payment-page.tsx`**

In `app/order-ui/src/app/system/payment/payment-page.tsx`, find the `StaffPaymentMethodSelect` render (~line 906-915). Add the prop:

```typescript
            <StaffPaymentMethodSelect
              order={order?.result}
              paymentMethod={effectiveMethods}
              defaultMethod={paymentMethod as PaymentMethod}
              disabledMethods={disabledMethods}
              disabledReasons={reasonMap}
              qrCode={hasValidPaymentAndQr ? qrCode : ''}
              total={order.result ? order.result.subtotal : 0}
              onSubmit={handleSelectPaymentMethod}
              initialQrToken={paymentData?.qrToken}
            />
```

- [ ] **Step 4: Build**

```bash
cd app/order-ui && npm run build 2>&1 | grep -E "error|✓ built"
```

Expected: `✓ built in Xs`

- [ ] **Step 5: Manual test — reload after QR scan**

1. Open payment page for an order with a customer owner
2. Select POINT → scan QR → badge "Đã quét QR" appears
3. Hard reload the page (Cmd+Shift+R)
4. Verify badge "Đã quét QR" is still visible after reload
5. Click confirm → payment succeeds (qrToken is sent correctly)

- [ ] **Step 6: Manual test — badge sync after voucher removal**

1. Scan QR → badge appears
2. Switch to a payment method that causes voucher conflict → remove voucher dialog
3. Confirm remove → payment page re-initializes
4. Verify badge "Đã quét QR" is still visible (qrToken preserved in store, synced via effect)

- [ ] **Step 7: Commit**

```bash
git add \
  app/order-ui/src/app/system/payment/payment-page.tsx \
  app/order-ui/src/components/app/select/staff-payment-method-select.tsx \
  app/order-ui/src/components/app/radio/staff-payment-method-radio-group.tsx
git commit -m "fix: restore QR badge after page reload by threading initialQrToken prop from store"
```
