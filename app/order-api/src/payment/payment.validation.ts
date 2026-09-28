import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const PAYMENT_QUERY_INVALID = 'PAYMENT_QUERY_INVALID';
export const PAYMENT_METHOD_INVALID = 'PAYMENT_METHOD_INVALID';
export const PAYMENT_NOT_FOUND = 'PAYMENT_NOT_FOUND';
export const TRANSACTION_NOT_FOUND = 'TRANSACTION_NOT_FOUND';
export const ONLY_BANK_TRANSFER_CAN_EXPORT = 'ONLY_BANK_TRANSFER_CAN_EXPORT';
export const INITIATE_PUBLIC_PAYMENT_DENIED = 'INITIATE_PUBLIC_PAYMENT_DENIED';
export const ROLE_NOT_ALLOWED_TO_INITIATE_PAYMENT =
  'ROLE_NOT_ALLOWED_TO_INITIATE_PAYMENT';
export const CUSTOMER_ONLY_USE_BANK_TRANSFER =
  'CUSTOMER_ONLY_USE_BANK_TRANSFER';
export const ORDER_ALREADY_HAS_PAYMENT = 'ORDER_ALREADY_HAS_PAYMENT';
export const ERROR_WHEN_UPDATE_PAYEMNT = 'ERROR_WHEN_UPDATE_PAYEMNT';
export const CREDIT_CARD_TRANSACTION_ID_REQUIRED =
  'CREDIT_CARD_TRANSACTION_ID_REQUIRED';
export const MEMBERSHIP_CARD_CODE_REQUIRED = 'MEMBERSHIP_CARD_CODE_REQUIRED';
export const CALLBACK_API_KEY_INVALID = 'CALLBACK_API_KEY_INVALID';
export const PAYMENT_CALLBACK_ROUTE_NOT_FOUND =
  'PAYMENT_CALLBACK_ROUTE_NOT_FOUND';
export const PAYMENT_CALLBACK_ROUTE_CODE_EXISTED =
  'PAYMENT_CALLBACK_ROUTE_CODE_EXISTED';
export const PAYMENT_CALLBACK_ROUTE_CREATION_FAILED =
  'PAYMENT_CALLBACK_ROUTE_CREATION_FAILED';
export const PAYMENT_CALLBACK_ROUTE_UPDATE_FAILED =
  'PAYMENT_CALLBACK_ROUTE_UPDATE_FAILED';
export const PAYMENT_CALLBACK_FORWARD_FAILED =
  'PAYMENT_CALLBACK_FORWARD_FAILED';

export type TPaymentErrorCodeKey =
  | typeof PAYMENT_QUERY_INVALID
  | typeof PAYMENT_NOT_FOUND
  | typeof TRANSACTION_NOT_FOUND
  | typeof PAYMENT_METHOD_INVALID
  | typeof ONLY_BANK_TRANSFER_CAN_EXPORT
  | typeof INITIATE_PUBLIC_PAYMENT_DENIED
  | typeof ROLE_NOT_ALLOWED_TO_INITIATE_PAYMENT
  | typeof CUSTOMER_ONLY_USE_BANK_TRANSFER
  | typeof ORDER_ALREADY_HAS_PAYMENT
  | typeof CREDIT_CARD_TRANSACTION_ID_REQUIRED
  | typeof ERROR_WHEN_UPDATE_PAYEMNT
  | typeof MEMBERSHIP_CARD_CODE_REQUIRED
  | typeof CALLBACK_API_KEY_INVALID
  | typeof PAYMENT_CALLBACK_ROUTE_NOT_FOUND
  | typeof PAYMENT_CALLBACK_ROUTE_CODE_EXISTED
  | typeof PAYMENT_CALLBACK_ROUTE_CREATION_FAILED
  | typeof PAYMENT_CALLBACK_ROUTE_UPDATE_FAILED
  | typeof PAYMENT_CALLBACK_FORWARD_FAILED;

export type TPaymentErrorCode = Record<TPaymentErrorCodeKey, TErrorCodeValue>;

// 123000 - 124000
export const PaymentValidation: TPaymentErrorCode = {
  PAYMENT_QUERY_INVALID: createErrorCode(123000, 'Payment query is invalid'),
  PAYMENT_METHOD_INVALID: createErrorCode(123001, 'Payment method is invalid'),
  PAYMENT_NOT_FOUND: createErrorCode(123002, 'Payment not found'),
  TRANSACTION_NOT_FOUND: createErrorCode(123003, 'Payment not found'),
  ONLY_BANK_TRANSFER_CAN_EXPORT: createErrorCode(
    123004,
    'Only bank transfer can export',
  ),
  INITIATE_PUBLIC_PAYMENT_DENIED: createErrorCode(
    123005,
    'Initiate public payment denied',
  ),
  ROLE_NOT_ALLOWED_TO_INITIATE_PAYMENT: createErrorCode(
    123006,
    'Role not allowed to initiate payment',
  ),
  CUSTOMER_ONLY_USE_BANK_TRANSFER: createErrorCode(
    123007,
    'Customer only use bank transfer',
  ),
  ORDER_ALREADY_HAS_PAYMENT: createErrorCode(
    123008,
    'Order already has a payment',
  ),
  ERROR_WHEN_UPDATE_PAYEMNT: createErrorCode(
    123009,
    'Error when updating the payment',
  ),
  CREDIT_CARD_TRANSACTION_ID_REQUIRED: createErrorCode(
    123010,
    'Credit card transaction id is required',
  ),
  MEMBERSHIP_CARD_CODE_REQUIRED: createErrorCode(
    123011,
    'Membership card code is required',
  ),
  CALLBACK_API_KEY_INVALID: createErrorCode(
    123012,
    'Callback api key is invalid',
  ),
  PAYMENT_CALLBACK_ROUTE_NOT_FOUND: createErrorCode(
    123013,
    'Payment callback route not found',
  ),
  PAYMENT_CALLBACK_ROUTE_CODE_EXISTED: createErrorCode(
    123014,
    'Payment callback route code already existed',
  ),
  PAYMENT_CALLBACK_ROUTE_CREATION_FAILED: createErrorCode(
    123015,
    'Failed to create payment callback route',
  ),
  PAYMENT_CALLBACK_ROUTE_UPDATE_FAILED: createErrorCode(
    123016,
    'Failed to update payment callback route',
  ),
  PAYMENT_CALLBACK_FORWARD_FAILED: createErrorCode(
    123017,
    'Failed to forward callback to external service',
  ),
};
