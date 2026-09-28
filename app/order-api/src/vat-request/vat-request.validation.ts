import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const VAT_REQUEST_NOT_FOUND = 'VAT_REQUEST_NOT_FOUND';
export const VAT_REQUEST_ALREADY_EXISTS = 'VAT_REQUEST_ALREADY_EXISTS';
export const INVOICE_NOT_FOUND_FOR_VAT = 'INVOICE_NOT_FOUND_FOR_VAT';
export const VAT_REQUEST_STATUS_INVALID = 'VAT_REQUEST_STATUS_INVALID';

export type TVatRequestErrorCodeKey =
  | typeof VAT_REQUEST_NOT_FOUND
  | typeof VAT_REQUEST_ALREADY_EXISTS
  | typeof INVOICE_NOT_FOUND_FOR_VAT
  | typeof VAT_REQUEST_STATUS_INVALID;

// Error range: 112000 - 113000
export const VatRequestValidation: Record<
  TVatRequestErrorCodeKey,
  TErrorCodeValue
> = {
  VAT_REQUEST_NOT_FOUND: createErrorCode(112000, 'VAT request not found'),
  VAT_REQUEST_ALREADY_EXISTS: createErrorCode(
    112001,
    'VAT request already exists for this invoice',
  ),
  INVOICE_NOT_FOUND_FOR_VAT: createErrorCode(112002, 'Invoice not found'),
  VAT_REQUEST_STATUS_INVALID: createErrorCode(
    112003,
    'VAT request status is invalid',
  ),
};
