import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const QR_TOKEN_INVALID = 'QR_TOKEN_INVALID';
export const QR_TOKEN_ALREADY_USED = 'QR_TOKEN_ALREADY_USED';
export const INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE';
export const FORBIDDEN_BRANCH = 'FORBIDDEN_BRANCH';
export const QR_OWNER_MISMATCH = 'QR_OWNER_MISMATCH';

export type TQrPaymentErrorCodeKey =
  | typeof QR_TOKEN_INVALID
  | typeof QR_TOKEN_ALREADY_USED
  | typeof INSUFFICIENT_BALANCE
  | typeof FORBIDDEN_BRANCH
  | typeof QR_OWNER_MISMATCH;

export type TQrPaymentErrorCode = Record<
  TQrPaymentErrorCodeKey,
  TErrorCodeValue
>;

// 160201 - 160300
export const QrPaymentValidation: TQrPaymentErrorCode = {
  QR_TOKEN_INVALID: createErrorCode(
    160201,
    'QR token is invalid or has expired',
  ),
  QR_TOKEN_ALREADY_USED: createErrorCode(
    160202,
    'QR token has already been used',
  ),
  INSUFFICIENT_BALANCE: createErrorCode(
    160203,
    'Customer does not have enough points',
  ),
  FORBIDDEN_BRANCH: createErrorCode(
    160204,
    'Staff does not belong to the order branch',
  ),
  QR_OWNER_MISMATCH: createErrorCode(
    160205,
    'QR token does not belong to the order owner',
  ),
};
