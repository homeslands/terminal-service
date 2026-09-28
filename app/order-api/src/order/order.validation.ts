import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const OWNER_NOT_FOUND = 'OWNER_NOT_FOUND';
export const INVALID_ORDER_ITEMS = 'INVALID_ORDER_ITEMS';
export const INVALID_ORDER_OWNER = 'INVALID_ORDER_OWNER';
export const INVALID_ORDER_APPROVAL_BY = 'INVALID_ORDER_APPROVAL_BY';
export const ORDER_INVALID = 'ORDER_INVALID';
export const ORDER_SLUG_INVALID = 'ORDER_SLUG_INVALID';
export const SUBTOTAL_NOT_VALID = 'SUBTOTAL_NOT_VALID';
export const ORDER_NOT_FOUND = 'ORDER_NOT_FOUND';
export const ORDER_STATUS_INVALID = 'ORDER_STATUS_INVALID';
export const REQUEST_QUANTITY_EXCESS_CURRENT_QUANTITY =
  'REQUEST_QUANTITY_EXCESS_CURRENT_QUANTITY';
export const ORDER_TYPE_INVALID = 'ORDER_TYPE_INVALID';
export const CREATE_ORDER_ERROR = 'CREATE_ORDER_ERROR';
export const ORDER_ID_INVALID = 'ORDER_ID_INVALID';
export const UPDATE_ORDER_ERROR = 'UPDATE_ORDER_ERROR';
export const INVALID_ORDER_SLUG = 'INVALID_ORDER_SLUG';
export const REQUEST_QUANTITY_MUST_OTHER_INFINITY =
  'REQUEST_QUANTITY_MUST_OTHER_INFINITY';
export const ERROR_WHEN_CREATE_CHEF_ORDERS_FROM_ORDER =
  'ERROR_WHEN_CREATE_CHEF_ORDERS_FROM_ORDER';
export const START_DATE_CAN_NOT_BE_EMPTY = 'START_DATE_CAN_NOT_BE_EMPTY';
export const END_DATE_CAN_NOT_BE_EMPTY = 'END_DATE_CAN_NOT_BE_EMPTY';
export const INVALID_TABLE_SLUG = 'INVALID_TABLE_SLUG';
export const INVALID_VOUCHER_SLUG = 'INVALID_VOUCHER_SLUG';
export const ORDER_IS_NOT_PENDING = 'ORDER_IS_NOT_PENDING';
export const ERROR_WHEN_CANCEL_ORDER = 'ERROR_WHEN_CANCEL_ORDER';
export const VOUCHER_IS_THE_SAME_PREVIOUS_VOUCHER =
  'VOUCHER_IS_THE_SAME_PREVIOUS_VOUCHER';
export const ORDER_IS_NOT_PAID = 'ORDER_IS_NOT_PAID';
export const ERROR_WHEN_UPDATE_ORDER = 'ERROR_WHEN_UPDATE_ORDER';
export const GIFT_PRODUCT_NOT_ALLOWED = 'GIFT_PRODUCT_NOT_ALLOWED';
export const DELIVERY_PHONE_NOT_FOUND = 'DELIVERY_PHONE_NOT_FOUND';
export const DELIVERY_ADDRESS_NOT_FOUND = 'DELIVERY_ADDRESS_NOT_FOUND';
export const DELIVERY_DISTANCE_GREATER_THAN_MAX_DISTANCE_DELIVERY =
  'DELIVERY_DISTANCE_GREATER_THAN_MAX_DISTANCE_DELIVERY';
export const DELIVERY_TYPE_NOT_ALLOWED = 'DELIVERY_TYPE_NOT_ALLOWED';
export const NOT_PERMISSION_TO_UPDATE_ORDER = 'NOT_PERMISSION_TO_UPDATE_ORDER';
export const CUSTOM_PRICE_PRODUCT_NOT_ALLOWED =
  'CUSTOM_PRICE_PRODUCT_NOT_ALLOWED';
export const CUSTOM_PRICE_IS_REQUIRED = 'CUSTOM_PRICE_IS_REQUIRED';
export const CANNOT_MIX_CUSTOM_PRICE_AND_NORMAL_PRODUCT =
  'CANNOT_MIX_CUSTOM_PRICE_AND_NORMAL_PRODUCT';
export const CUSTOM_PRICE_MUST_BE_GREATER_THAN_ZERO =
  'CUSTOM_PRICE_MUST_BE_GREATER_THAN_ZERO';
export const CUSTOM_PRICE_ORDER_QUANTITY_MUST_BE_ONE =
  'CUSTOM_PRICE_ORDER_QUANTITY_MUST_BE_ONE';
export const CUSTOM_PRICE_ORDER_CANNOT_ADD_ITEM =
  'CUSTOM_PRICE_ORDER_CANNOT_ADD_ITEM';
export const CUSTOM_PRICE_ORDER_CANNOT_CHANGE_QUANTITY =
  'CUSTOM_PRICE_ORDER_CANNOT_CHANGE_QUANTITY';
export const ORDER_NOT_AT_TABLE = 'ORDER_NOT_AT_TABLE';
export const NEW_TABLE_IS_NOT_AVAILABLE = 'NEW_TABLE_IS_NOT_AVAILABLE';
export const NEW_TABLE_MUST_BE_DIFFERENT = 'NEW_TABLE_MUST_BE_DIFFERENT';
export const CHANGE_TABLE_ERROR = 'CHANGE_TABLE_ERROR';
export const TABLE_HAS_PENDING_ORDER = 'TABLE_HAS_PENDING_ORDER';
export const CHANGE_OWNER_ERROR = 'CHANGE_OWNER_ERROR';
export const NOT_PERMISSION_TO_DELETE_ORDER =
  'NOT_PERMISSION_TO_DELETE_ORDER';

export type TOrderErrorCodeKey =
  | typeof OWNER_NOT_FOUND
  | typeof ORDER_STATUS_INVALID
  | typeof ORDER_NOT_FOUND
  | typeof ORDER_SLUG_INVALID
  | typeof SUBTOTAL_NOT_VALID
  | typeof ORDER_TYPE_INVALID
  | typeof CREATE_ORDER_ERROR
  | typeof ORDER_ID_INVALID
  | typeof ORDER_INVALID
  | typeof INVALID_ORDER_OWNER
  | typeof INVALID_ORDER_APPROVAL_BY
  | typeof INVALID_ORDER_ITEMS
  | typeof UPDATE_ORDER_ERROR
  | typeof INVALID_ORDER_SLUG
  | typeof REQUEST_QUANTITY_MUST_OTHER_INFINITY
  | typeof ERROR_WHEN_CREATE_CHEF_ORDERS_FROM_ORDER
  | typeof REQUEST_QUANTITY_EXCESS_CURRENT_QUANTITY
  | typeof START_DATE_CAN_NOT_BE_EMPTY
  | typeof END_DATE_CAN_NOT_BE_EMPTY
  | typeof INVALID_TABLE_SLUG
  | typeof INVALID_VOUCHER_SLUG
  | typeof ORDER_IS_NOT_PENDING
  | typeof ERROR_WHEN_CANCEL_ORDER
  | typeof VOUCHER_IS_THE_SAME_PREVIOUS_VOUCHER
  | typeof ORDER_IS_NOT_PAID
  | typeof ERROR_WHEN_UPDATE_ORDER
  | typeof GIFT_PRODUCT_NOT_ALLOWED
  | typeof DELIVERY_PHONE_NOT_FOUND
  | typeof DELIVERY_ADDRESS_NOT_FOUND
  | typeof DELIVERY_DISTANCE_GREATER_THAN_MAX_DISTANCE_DELIVERY
  | typeof DELIVERY_TYPE_NOT_ALLOWED
  | typeof NOT_PERMISSION_TO_UPDATE_ORDER
  | typeof CUSTOM_PRICE_PRODUCT_NOT_ALLOWED
  | typeof CUSTOM_PRICE_IS_REQUIRED
  | typeof CANNOT_MIX_CUSTOM_PRICE_AND_NORMAL_PRODUCT
  | typeof CUSTOM_PRICE_MUST_BE_GREATER_THAN_ZERO
  | typeof CUSTOM_PRICE_ORDER_QUANTITY_MUST_BE_ONE
  | typeof CUSTOM_PRICE_ORDER_CANNOT_ADD_ITEM
  | typeof CUSTOM_PRICE_ORDER_CANNOT_CHANGE_QUANTITY
  | typeof ORDER_NOT_AT_TABLE
  | typeof NEW_TABLE_IS_NOT_AVAILABLE
  | typeof NEW_TABLE_MUST_BE_DIFFERENT
  | typeof CHANGE_TABLE_ERROR
  | typeof TABLE_HAS_PENDING_ORDER
  | typeof CHANGE_OWNER_ERROR
  | typeof NOT_PERMISSION_TO_DELETE_ORDER;

export type TOrderErrorCode = Record<TOrderErrorCodeKey, TErrorCodeValue>;

// Error range: 101000 - 102000
export const OrderValidation: TOrderErrorCode = {
  OWNER_NOT_FOUND: createErrorCode(101000, 'Owner invalid'),
  ORDER_NOT_FOUND: createErrorCode(101001, 'Order not found'),
  ORDER_STATUS_INVALID: createErrorCode(101002, 'Order status invalid'),
  REQUEST_QUANTITY_EXCESS_CURRENT_QUANTITY: createErrorCode(
    101003,
    'Request quantity excess current quantity',
  ),
  ORDER_SLUG_INVALID: createErrorCode(101004, 'Order slug not found'),
  SUBTOTAL_NOT_VALID: createErrorCode(101005, 'Order subtotal is not valid'),
  ORDER_TYPE_INVALID: createErrorCode(101006, 'Order type is not valid'),
  CREATE_ORDER_ERROR: createErrorCode(101007, 'Error when saving order'),
  ORDER_ID_INVALID: createErrorCode(101008, 'Order id invalid'),
  ORDER_INVALID: createErrorCode(101009, 'Order invalid'),
  INVALID_ORDER_OWNER: createErrorCode(1010010, 'Owner invalid'),
  INVALID_ORDER_APPROVAL_BY: createErrorCode(1010011, 'Approval invalid'),
  INVALID_ORDER_ITEMS: createErrorCode(1010012, 'Invalid order items'),
  UPDATE_ORDER_ERROR: createErrorCode(1010013, 'Error when updating order'),
  INVALID_ORDER_SLUG: createErrorCode(1010014, 'Invalid order slug'),
  REQUEST_QUANTITY_MUST_OTHER_INFINITY: createErrorCode(
    1010015,
    'Request quantity must other infinity',
  ),
  ERROR_WHEN_CREATE_CHEF_ORDERS_FROM_ORDER: createErrorCode(
    1010016,
    'Error when create chef orders from order',
  ),
  START_DATE_CAN_NOT_BE_EMPTY: createErrorCode(
    1010017,
    'Start date can not be empty',
  ),
  END_DATE_CAN_NOT_BE_EMPTY: createErrorCode(
    1010018,
    'End date can not be empty',
  ),
  INVALID_TABLE_SLUG: createErrorCode(1010019, 'Invalid table slug'),
  INVALID_VOUCHER_SLUG: createErrorCode(1010020, 'Invalid voucher slug'),
  ORDER_IS_NOT_PENDING: createErrorCode(1010021, 'Order is not pending'),
  ERROR_WHEN_CANCEL_ORDER: createErrorCode(1010022, 'Error when cancel order'),
  VOUCHER_IS_THE_SAME_PREVIOUS_VOUCHER: createErrorCode(
    1010023,
    'Voucher is the same previous voucher',
  ),
  ORDER_IS_NOT_PAID: createErrorCode(1010024, 'Order is not paid'),
  ERROR_WHEN_UPDATE_ORDER: createErrorCode(1010025, 'Error when update order'),
  GIFT_PRODUCT_NOT_ALLOWED: createErrorCode(
    1010026,
    'Gift product not allowed',
  ),
  DELIVERY_PHONE_NOT_FOUND: createErrorCode(
    1010027,
    'Delivery phone not found',
  ),
  DELIVERY_ADDRESS_NOT_FOUND: createErrorCode(
    1010028,
    'Delivery address not found',
  ),
  DELIVERY_DISTANCE_GREATER_THAN_MAX_DISTANCE_DELIVERY: createErrorCode(
    1010029,
    'Delivery distance is greater than max distance delivery',
  ),
  DELIVERY_TYPE_NOT_ALLOWED: createErrorCode(
    1010030,
    'Delivery type not allowed',
  ),
  NOT_PERMISSION_TO_UPDATE_ORDER: createErrorCode(
    1010031,
    'Not permission to update order',
  ),
  CUSTOM_PRICE_PRODUCT_NOT_ALLOWED: createErrorCode(
    1010032,
    'Custom price product not allowed',
  ),
  CUSTOM_PRICE_IS_REQUIRED: createErrorCode(
    1010033,
    'Custom price is required for this product',
  ),
  CANNOT_MIX_CUSTOM_PRICE_AND_NORMAL_PRODUCT: createErrorCode(
    1010034,
    'Cannot mix custom price and normal products in the same order',
  ),
  CUSTOM_PRICE_MUST_BE_GREATER_THAN_ZERO: createErrorCode(
    1010035,
    'Custom price must be greater than zero',
  ),
  CUSTOM_PRICE_ORDER_QUANTITY_MUST_BE_ONE: createErrorCode(
    1010036,
    'Custom price product order must have quantity of one',
  ),
  CUSTOM_PRICE_ORDER_CANNOT_ADD_ITEM: createErrorCode(
    1010037,
    'Cannot add item to an order that contains a custom price product',
  ),
  CUSTOM_PRICE_ORDER_CANNOT_CHANGE_QUANTITY: createErrorCode(
    1010038,
    'Cannot change quantity of a custom price product order item',
  ),
  ORDER_NOT_AT_TABLE: createErrorCode(
    1010039,
    'Order is not at table type',
  ),
  NEW_TABLE_IS_NOT_AVAILABLE: createErrorCode(
    1010040,
    'New table is not available',
  ),
  NEW_TABLE_MUST_BE_DIFFERENT: createErrorCode(
    1010041,
    'New table must be different from current table',
  ),
  CHANGE_TABLE_ERROR: createErrorCode(
    1010042,
    'Error when changing table for order',
  ),
  TABLE_HAS_PENDING_ORDER: createErrorCode(
    1010043,
    'Table already has a pending order, cannot create new order',
  ),
  CHANGE_OWNER_ERROR: createErrorCode(
    1010044,
    'Error when changing owner of order',
  ),
  NOT_PERMISSION_TO_DELETE_ORDER: createErrorCode(
    1010045,
    'You do not have permission to delete this order',
  ),
};
