export const PaymentMethod = {
  BANK_TRANSFER: 'bank-transfer',
  CASH: 'cash',
  // INTERNAL: 'internal',
  POINT: 'point',
  CREDIT_CARD: 'credit-card',
};

export const PaymentStatus = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

export const PaymentAction = {
  PAYMENT_PAID: 'payment.paid',
  CARD_ORDER_PAYMENT_PAID: 'card-order-payment.paid',
};

export const ModeCancelQRBankTransfer = {
  APPLY: 'apply',
  NOT_APPLY: 'not-apply',
};

export const PaymentMethodMapper = {
  [PaymentMethod.BANK_TRANSFER]: 'Chuyển khoản ngân hàng',
  [PaymentMethod.CASH]: 'Tiền mặt',
  [PaymentMethod.POINT]: 'Thanh toán bằng xu',
  [PaymentMethod.CREDIT_CARD]: 'Thẻ tín dụng',
};

export const PaymentCallbackServiceType = {
  INTERNAL: 'internal',
  EXTERNAL: 'external',
};

export const PaymentCallbackInboxStatus = {
  RECEIVED: 'received',
  PROCESSED: 'processed',
  FAILED: 'failed',
};

export const PAYMENT_CALLBACK_PROCESS_JOB = 'process-payment-callback';
