export enum AccumulatedPointTransactionType {
  ADD = 'add',
  USE = 'use',
  RESERVE = 'reserve', // Temporary reserve when apply for order
  REFUND = 'refund', // Refund when order is cancelled
}

export enum AccumulatedPointTransactionStatus {
  PENDING = 'pending', // Pending (reserve)
  CONFIRMED = 'confirmed', // Confirmed (actually subtract/add points)
  CANCELLED = 'cancelled', // Cancelled - Points will be returned
}

// Buoc 7.7d: `objectType` cua dong lich su diem ben shared-user cho mot don
// hang - cung gia tri migration 6.3 cua shared-user ghi cho dong cu ('ORDER').
export const ACCUMULATED_POINT_OBJECT_TYPE_ORDER = 'ORDER';
