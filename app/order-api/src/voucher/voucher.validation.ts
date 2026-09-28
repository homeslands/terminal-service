import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';
import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

export const VOUCHER_NOT_FOUND = 'VOUCHER_NOT_FOUND';
export const CREATE_VOUCHER_FAILED = 'CREATE_VOUCHER_FAILED';
export const FIND_ALL_VOUCHER_FAILED = 'FIND_ALL_VOUCHER_FAILED';
export const FIND_ONE_VOUCHER_FAILED = 'FIND_ONE_VOUCHER_FAILED';
export const UPDATE_VOUCHER_FAILED = 'UPDATE_VOUCHER_FAILED';
export const DELETE_VOUCHER_FAILED = 'DELETE_VOUCHER_FAILED';
export const VOUCHER_ALREADY_USED = 'VOUCHER_ALREADY_USED';
export const VOUCHER_IS_NOT_ACTIVE = 'VOUCHER_IS_NOT_ACTIVE';
export const VOUCHER_HAS_NO_REMAINING_USAGE = 'VOUCHER_HAS_NO_REMAINING_USAGE';
export const ORDER_VALUE_LESS_THAN_MIN_ORDER_VALUE =
  'ORDER_VALUE_LESS_THAN_MIN_ORDER_VALUE';
export const USER_MUST_BE_CUSTOMER = 'USER_MUST_BE_CUSTOMER';
export const VALIDATE_VOUCHER_USAGE_FAILED = 'VALIDATE_VOUCHER_USAGE_FAILED';
export const INVALID_VOUCHER_TYPE = 'INVALID_VOUCHER_TYPE';
export const INVALID_NUMBER_OF_USAGE_PER_USER =
  'INVALID_NUMBER_OF_USAGE_PER_USER';
export const DUPLICATE_VOUCHER_TITLE = 'DUPLICATE_VOUCHER_TITLE';
export const MUST_VERIFY_IDENTITY_TO_USE_VOUCHER =
  'MUST_VERIFY_IDENTITY_TO_USE_VOUCHER';
export const VOUCHER_HAS_ORDERS = 'VOUCHER_HAS_ORDERS';
export const VOUCHER_HAS_USED_CAN_NOT_UPDATE_MAX_USAGE =
  'VOUCHER_HAS_USED_CAN_NOT_UPDATE_MAX_USAGE';
export const INVALID_VOUCHER_SLUGS = 'INVALID_VOUCHER_SLUGS';
export const INVALID_VOUCHER_VALUE = 'INVALID_VOUCHER_VALUE';
export const PRODUCT_NOT_APPLIED_TO_VOUCHER = 'PRODUCT_NOT_APPLIED_TO_VOUCHER';
export const INVALID_VOUCHER_APPLICABILITY_RULE =
  'INVALID_VOUCHER_APPLICABILITY_RULE';
export const ALL_PRODUCT_MUST_BE_APPLIED_TO_VOUCHER =
  'ALL_PRODUCT_MUST_BE_APPLIED_TO_VOUCHER';
export const AT_LEAST_ONE_PRODUCT_MUST_BE_APPLIED_TO_VOUCHER =
  'AT_LEAST_ONE_PRODUCT_MUST_BE_APPLIED_TO_VOUCHER';
export const VOUCHER_IS_NOT_STARTED = 'VOUCHER_IS_NOT_STARTED';
export const VOUCHER_IS_EXPIRED = 'VOUCHER_IS_EXPIRED';
export const VOUCHER_PAYMENT_METHOD_ALREADY_EXISTS =
  'VOUCHER_PAYMENT_METHOD_ALREADY_EXISTS';
export const CREATE_VOUCHER_PAYMENT_METHOD_FAILED =
  'CREATE_VOUCHER_PAYMENT_METHOD_FAILED';
export const VOUCHER_PAYMENT_METHOD_NOT_FOUND =
  'VOUCHER_PAYMENT_METHOD_NOT_FOUND';
export const DELETE_VOUCHER_PAYMENT_METHOD_FAILED =
  'DELETE_VOUCHER_PAYMENT_METHOD_FAILED';
export const VOUCHER_MUST_HAVE_AT_LEAST_ONE_PAYMENT_METHOD =
  'VOUCHER_MUST_HAVE_AT_LEAST_ONE_PAYMENT_METHOD';
export const USER_NOT_IN_USER_GROUP_THAT_CAN_USE_VOUCHER =
  'USER_NOT_IN_USER_GROUP_THAT_CAN_USE_VOUCHER';
export const IS_VERIFICATION_IDENTITY_MUST_BE_TRUE_IF_CUSTOMER_TYPE_IS_GROUP =
  'IS_VERIFICATION_IDENTITY_MUST_BE_TRUE_IF_CUSTOMER_TYPE_IS_GROUP';
export const VOUCHER_HAS_USED_CAN_NOT_UPDATE_CUSTOMER_TYPE =
  'VOUCHER_HAS_USED_CAN_NOT_UPDATE_CUSTOMER_TYPE';
export const VOUCHER_HAS_USER_GROUP_CAN_NOT_UPDATE_CUSTOMER_TYPE =
  'VOUCHER_HAS_USER_GROUP_CAN_NOT_UPDATE_CUSTOMER_TYPE';
export const VOUCHER_HAS_USER_GROUP_CAN_NOT_UPDATE_IS_VERIFICATION_IDENTITY =
  'VOUCHER_HAS_USER_GROUP_CAN_NOT_UPDATE_IS_VERIFICATION_IDENTITY';
export const VOUCHER_HAS_REACHED_USAGE_FREQUENCY_LIMIT_IN_RANGE_TIME =
  'VOUCHER_HAS_REACHED_USAGE_FREQUENCY_LIMIT_IN_RANGE_TIME';
export const MAX_ITEMS_IS_EXCEEDED = 'MAX_ITEMS_IS_EXCEEDED';
export const INVALID_USAGE_FREQUENCY_VALUE = 'INVALID_USAGE_FREQUENCY_VALUE';
export const END_TIME_MUST_BE_GREATER_OR_EQUAL_START_TIME =
  'END_TIME_MUST_BE_GREATER_OR_EQUAL_START_TIME';
export const INDIVIDUAL_VOUCHER_CAN_NOT_BE_USED_FOR_USER =
  'INDIVIDUAL_VOUCHER_CAN_NOT_BE_USED_FOR_USER';
export const IS_VERIFICATION_IDENTITY_MUST_BE_TRUE_IF_CUSTOMER_TYPE_IS_PERSON =
  'IS_VERIFICATION_IDENTITY_MUST_BE_TRUE_IF_CUSTOMER_TYPE_IS_PERSON';
export const CAN_NOT_UPDATE_ASSIGNED_USER_FOR_INDIVIDUAL_VOUCHER_WHEN_USED =
  'CAN_NOT_UPDATE_ASSIGNED_USER_FOR_INDIVIDUAL_VOUCHER_WHEN_USED';
export const ASSIGNED_USER_IS_REQUIRED_WITH_INDIVIDUAL_VOUCHER =
  'ASSIGNED_USER_IS_REQUIRED_WITH_INDIVIDUAL_VOUCHER';
export const MUST_VERIFY_EMAIL_OR_PHONE_NUMBER_TO_USE_VOUCHER =
  'MUST_VERIFY_EMAIL_OR_PHONE_NUMBER_TO_USE_VOUCHER';
export const VOUCHER_IS_NOT_IN_ACTIVE_TIME_WINDOW =
  'VOUCHER_IS_NOT_IN_ACTIVE_TIME_WINDOW';
export const ACTIVE_TIME_WINDOW_BOTH_REQUIRED =
  'ACTIVE_TIME_WINDOW_BOTH_REQUIRED';
export type TVoucherErrorCodeKey =
  | typeof VOUCHER_IS_NOT_IN_ACTIVE_TIME_WINDOW
  | typeof ACTIVE_TIME_WINDOW_BOTH_REQUIRED
  | typeof VOUCHER_NOT_FOUND
  | typeof FIND_ALL_VOUCHER_FAILED
  | typeof FIND_ONE_VOUCHER_FAILED
  | typeof UPDATE_VOUCHER_FAILED
  | typeof DELETE_VOUCHER_FAILED
  | typeof VOUCHER_ALREADY_USED
  | typeof VOUCHER_IS_NOT_ACTIVE
  | typeof ORDER_VALUE_LESS_THAN_MIN_ORDER_VALUE
  | typeof VOUCHER_HAS_NO_REMAINING_USAGE
  | typeof CREATE_VOUCHER_FAILED
  | typeof USER_MUST_BE_CUSTOMER
  | typeof VALIDATE_VOUCHER_USAGE_FAILED
  | typeof INVALID_VOUCHER_TYPE
  | typeof INVALID_NUMBER_OF_USAGE_PER_USER
  | typeof DUPLICATE_VOUCHER_TITLE
  | typeof MUST_VERIFY_IDENTITY_TO_USE_VOUCHER
  | typeof VOUCHER_HAS_ORDERS
  | typeof VOUCHER_HAS_USED_CAN_NOT_UPDATE_MAX_USAGE
  | typeof INVALID_VOUCHER_SLUGS
  | typeof INVALID_VOUCHER_VALUE
  | typeof PRODUCT_NOT_APPLIED_TO_VOUCHER
  | typeof INVALID_VOUCHER_APPLICABILITY_RULE
  | typeof ALL_PRODUCT_MUST_BE_APPLIED_TO_VOUCHER
  | typeof AT_LEAST_ONE_PRODUCT_MUST_BE_APPLIED_TO_VOUCHER
  | typeof VOUCHER_IS_NOT_STARTED
  | typeof VOUCHER_IS_EXPIRED
  | typeof VOUCHER_PAYMENT_METHOD_ALREADY_EXISTS
  | typeof CREATE_VOUCHER_PAYMENT_METHOD_FAILED
  | typeof VOUCHER_PAYMENT_METHOD_NOT_FOUND
  | typeof DELETE_VOUCHER_PAYMENT_METHOD_FAILED
  | typeof VOUCHER_MUST_HAVE_AT_LEAST_ONE_PAYMENT_METHOD
  | typeof USER_NOT_IN_USER_GROUP_THAT_CAN_USE_VOUCHER
  | typeof IS_VERIFICATION_IDENTITY_MUST_BE_TRUE_IF_CUSTOMER_TYPE_IS_GROUP
  | typeof VOUCHER_HAS_USED_CAN_NOT_UPDATE_CUSTOMER_TYPE
  | typeof VOUCHER_HAS_USER_GROUP_CAN_NOT_UPDATE_CUSTOMER_TYPE
  | typeof VOUCHER_HAS_USER_GROUP_CAN_NOT_UPDATE_IS_VERIFICATION_IDENTITY
  | typeof VOUCHER_HAS_REACHED_USAGE_FREQUENCY_LIMIT_IN_RANGE_TIME
  | typeof MAX_ITEMS_IS_EXCEEDED
  | typeof INVALID_USAGE_FREQUENCY_VALUE
  | typeof VOUCHER_HAS_USER_GROUP_CAN_NOT_UPDATE_IS_VERIFICATION_IDENTITY
  | typeof END_TIME_MUST_BE_GREATER_OR_EQUAL_START_TIME
  | typeof INDIVIDUAL_VOUCHER_CAN_NOT_BE_USED_FOR_USER
  | typeof IS_VERIFICATION_IDENTITY_MUST_BE_TRUE_IF_CUSTOMER_TYPE_IS_PERSON
  | typeof CAN_NOT_UPDATE_ASSIGNED_USER_FOR_INDIVIDUAL_VOUCHER_WHEN_USED
  | typeof ASSIGNED_USER_IS_REQUIRED_WITH_INDIVIDUAL_VOUCHER
  | typeof MUST_VERIFY_EMAIL_OR_PHONE_NUMBER_TO_USE_VOUCHER;

export type TVoucherErrorCode = Record<TVoucherErrorCodeKey, TErrorCodeValue>;

// 143401 – 144000
export const VoucherValidation: TVoucherErrorCode = {
  VOUCHER_NOT_FOUND: createErrorCode(143401, 'Voucher not found'),
  CREATE_VOUCHER_FAILED: createErrorCode(143402, 'Failed to create voucher'),
  FIND_ALL_VOUCHER_FAILED: createErrorCode(
    143403,
    'Failed to find all vouchers',
  ),
  FIND_ONE_VOUCHER_FAILED: createErrorCode(
    143404,
    'Failed to find one voucher',
  ),
  UPDATE_VOUCHER_FAILED: createErrorCode(143405, 'Failed to update voucher'),
  DELETE_VOUCHER_FAILED: createErrorCode(143406, 'Failed to delete voucher'),
  VOUCHER_ALREADY_USED: createErrorCode(143407, 'Voucher already used'),
  VOUCHER_IS_NOT_ACTIVE: createErrorCode(143408, 'Voucher is not active'),
  ORDER_VALUE_LESS_THAN_MIN_ORDER_VALUE: createErrorCode(
    143409,
    'Order value is less than min order value',
  ),
  VOUCHER_HAS_NO_REMAINING_USAGE: createErrorCode(
    143410,
    'Voucher has no remaining usage',
  ),
  USER_MUST_BE_CUSTOMER: createErrorCode(143411, 'User must be customer'),
  VALIDATE_VOUCHER_USAGE_FAILED: createErrorCode(
    143412,
    'Validate voucher usage failed',
  ),
  INVALID_VOUCHER_TYPE: createErrorCode(143413, 'Invalid voucher type'),
  INVALID_NUMBER_OF_USAGE_PER_USER: createErrorCode(
    143414,
    'Invalid number of usage per user',
  ),
  DUPLICATE_VOUCHER_TITLE: createErrorCode(143415, 'Duplicate voucher title'),
  MUST_VERIFY_IDENTITY_TO_USE_VOUCHER: createErrorCode(
    143416,
    'Must verify identity to use voucher',
  ),
  VOUCHER_HAS_ORDERS: createErrorCode(143417, 'Voucher has orders'),
  VOUCHER_HAS_USED_CAN_NOT_UPDATE_MAX_USAGE: createErrorCode(
    143418,
    'Voucher has used can not update max usage',
  ),
  INVALID_VOUCHER_SLUGS: createErrorCode(143419, 'Invalid voucher slugs'),
  INVALID_VOUCHER_VALUE: createErrorCode(143420, 'Invalid voucher value'),
  PRODUCT_NOT_APPLIED_TO_VOUCHER: createErrorCode(
    143422,
    'Product not applied to voucher',
  ),
  INVALID_VOUCHER_APPLICABILITY_RULE: createErrorCode(
    143423,
    'Invalid voucher applicability rule',
  ),
  ALL_PRODUCT_MUST_BE_APPLIED_TO_VOUCHER: createErrorCode(
    143424,
    'All product must be applied to voucher',
  ),
  AT_LEAST_ONE_PRODUCT_MUST_BE_APPLIED_TO_VOUCHER: createErrorCode(
    143425,
    'At least one product must be applied to voucher',
  ),
  VOUCHER_IS_EXPIRED: createErrorCode(143426, 'Voucher is expired'),
  VOUCHER_IS_NOT_STARTED: createErrorCode(143427, 'Voucher is not started'),
  MUST_VERIFY_EMAIL_OR_PHONE_NUMBER_TO_USE_VOUCHER: createErrorCode(
    143428,
    'User must verify email or phone number to use voucher',
  ),
  VOUCHER_PAYMENT_METHOD_ALREADY_EXISTS: createErrorCode(
    143429,
    'Voucher payment method already exists',
  ),
  CREATE_VOUCHER_PAYMENT_METHOD_FAILED: createErrorCode(
    143430,
    'Failed to create voucher payment method',
  ),
  VOUCHER_PAYMENT_METHOD_NOT_FOUND: createErrorCode(
    143431,
    'Voucher payment method not found',
  ),
  DELETE_VOUCHER_PAYMENT_METHOD_FAILED: createErrorCode(
    143432,
    'Failed to delete voucher payment method',
  ),
  VOUCHER_MUST_HAVE_AT_LEAST_ONE_PAYMENT_METHOD: createErrorCode(
    143433,
    'Voucher must have at least one payment method',
  ),
  USER_NOT_IN_USER_GROUP_THAT_CAN_USE_VOUCHER: createErrorCode(
    143434,
    'User not in user group that can use voucher',
  ),
  IS_VERIFICATION_IDENTITY_MUST_BE_TRUE_IF_CUSTOMER_TYPE_IS_GROUP:
    createErrorCode(
      143435,
      'Is verification identity must be true if customer type is group',
    ),
  VOUCHER_HAS_USED_CAN_NOT_UPDATE_CUSTOMER_TYPE: createErrorCode(
    143436,
    'Voucher has used can not update customer type',
  ),
  VOUCHER_HAS_USER_GROUP_CAN_NOT_UPDATE_CUSTOMER_TYPE: createErrorCode(
    143437,
    'Voucher has user group can not update customer type',
  ),
  VOUCHER_HAS_USER_GROUP_CAN_NOT_UPDATE_IS_VERIFICATION_IDENTITY:
    createErrorCode(
      143438,
      'Voucher has user group can not update is verification identity',
    ),
  VOUCHER_HAS_REACHED_USAGE_FREQUENCY_LIMIT_IN_RANGE_TIME: createErrorCode(
    143439,
    'Voucher has reached usage frequency limit in range time',
  ),
  MAX_ITEMS_IS_EXCEEDED: createErrorCode(143440, 'Max items is exceeded'),
  INVALID_USAGE_FREQUENCY_VALUE: createErrorCode(
    143441,
    'Invalid usage frequency value',
  ),
  END_TIME_MUST_BE_GREATER_OR_EQUAL_START_TIME: createErrorCode(
    143442,
    'End time must be greater or equal start time',
  ),
  INDIVIDUAL_VOUCHER_CAN_NOT_BE_USED_FOR_USER: createErrorCode(
    143443,
    'Individual voucher can not be used for user',
  ),
  IS_VERIFICATION_IDENTITY_MUST_BE_TRUE_IF_CUSTOMER_TYPE_IS_PERSON:
    createErrorCode(
      143444,
      'Is verification identity must be true if customer type is person',
    ),
  CAN_NOT_UPDATE_ASSIGNED_USER_FOR_INDIVIDUAL_VOUCHER_WHEN_USED:
    createErrorCode(
      143445,
      'Can not update assigned user for individual voucher when used',
    ),
  ASSIGNED_USER_IS_REQUIRED_WITH_INDIVIDUAL_VOUCHER: createErrorCode(
    143446,
    'Assigned user is required with individual voucher',
  ),
  VOUCHER_IS_NOT_IN_ACTIVE_TIME_WINDOW: createErrorCode(
    143447,
    'Voucher is not in active time window',
  ),
  ACTIVE_TIME_WINDOW_BOTH_REQUIRED: createErrorCode(
    143448,
    'Both activeStartTime and activeEndTime must be provided together, and activeStartTime must be before activeEndTime',
  ),
};

export function IsActiveTimeWindowValid(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isActiveTimeWindowValid',
      target: object.constructor,
      propertyName: propertyName,
      options: {
        message:
          'Both activeStartTime and activeEndTime must be provided together, and activeStartTime must be before activeEndTime',
        ...validationOptions,
      },
      validator: {
        validate(_value: any, args: ValidationArguments) {
          const obj = args.object as any;
          const start: string | undefined = obj.activeStartTime;
          const end: string | undefined = obj.activeEndTime;
          if (!start && !end) return true;
          if (!start || !end) return false;
          return start < end;
        },
      },
    });
  };
}

// Custom validator decorator for date range validation
export function IsEndDateAfterStartDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isEndDateAfterStartDate',
      target: object.constructor,
      propertyName: propertyName,
      options: {
        message: 'End date must be greater than or equal to start date.',
        ...validationOptions,
      },
      validator: {
        validate(value: any, args: ValidationArguments) {
          const obj = args.object as any;
          const startDate = obj.startDate;
          const endDate = obj.endDate;

          if (!startDate || !endDate) return true;

          return endDate >= startDate;
        },
      },
    });
  };
}
