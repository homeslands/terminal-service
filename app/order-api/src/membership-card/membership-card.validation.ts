import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const MEMBERSHIP_CARD_NOT_FOUND = 'MEMBERSHIP_CARD_NOT_FOUND';
export const MEMBERSHIP_CARD_CODE_REQUIRED = 'MEMBERSHIP_CARD_CODE_REQUIRED';
export const USER_SLUG_REQUIRED = 'USER_SLUG_REQUIRED';
export const USER_ALREADY_HAS_A_MEMBERSHIP_CARD =
  'USER_ALREADY_HAS_A_MEMBERSHIP_CARD';
export const ERROR_WHEN_REPLACE_MEMBERSHIP_CARD =
  'ERROR_WHEN_REPLACE_MEMBERSHIP_CARD';
export const ERROR_WHEN_DELETE_MEMBERSHIP_CARD =
  'ERROR_WHEN_DELETE_MEMBERSHIP_CARD';
export const MEMBERSHIP_CARD_CODE_ALREADY_EXISTS =
  'MEMBERSHIP_CARD_CODE_ALREADY_EXISTS';
export const MEMBERSHIP_CARD_EXPIRED = 'MEMBERSHIP_CARD_EXPIRED';
export const ERROR_WHEN_CREATE_MEMBERSHIP_CARDS =
  'ERROR_WHEN_CREATE_MEMBERSHIP_CARDS';
export const MEMBERSHIP_CARD_USER_IS_NOT_THE_ORDER_OWNER =
  'MEMBERSHIP_CARD_USER_IS_NOT_THE_ORDER_OWNER';

export type TMembershipCardErrorCodeKey =
  | typeof MEMBERSHIP_CARD_NOT_FOUND
  | typeof MEMBERSHIP_CARD_CODE_REQUIRED
  | typeof USER_SLUG_REQUIRED
  | typeof USER_ALREADY_HAS_A_MEMBERSHIP_CARD
  | typeof ERROR_WHEN_REPLACE_MEMBERSHIP_CARD
  | typeof ERROR_WHEN_DELETE_MEMBERSHIP_CARD
  | typeof MEMBERSHIP_CARD_CODE_ALREADY_EXISTS
  | typeof MEMBERSHIP_CARD_EXPIRED
  | typeof ERROR_WHEN_CREATE_MEMBERSHIP_CARDS
  | typeof MEMBERSHIP_CARD_USER_IS_NOT_THE_ORDER_OWNER;

export type TMembershipCardErrorCode = Record<
  TMembershipCardErrorCodeKey,
  TErrorCodeValue
>;

// 159801 - 159900
export const MembershipCardValidation: TMembershipCardErrorCode = {
  MEMBERSHIP_CARD_NOT_FOUND: createErrorCode(
    159801,
    'Membership card not found',
  ),
  MEMBERSHIP_CARD_CODE_REQUIRED: createErrorCode(
    159802,
    'Membership card code is required',
  ),
  USER_ALREADY_HAS_A_MEMBERSHIP_CARD: createErrorCode(
    159803,
    'User already has a membership card',
  ),
  USER_SLUG_REQUIRED: createErrorCode(159804, 'User slug is required'),
  ERROR_WHEN_REPLACE_MEMBERSHIP_CARD: createErrorCode(
    159805,
    'Error when replace membership card',
  ),
  ERROR_WHEN_DELETE_MEMBERSHIP_CARD: createErrorCode(
    159806,
    'Error when delete membership card',
  ),
  MEMBERSHIP_CARD_CODE_ALREADY_EXISTS: createErrorCode(
    159807,
    'Membership card code already exists',
  ),
  MEMBERSHIP_CARD_EXPIRED: createErrorCode(159808, 'Membership card expired'),
  ERROR_WHEN_CREATE_MEMBERSHIP_CARDS: createErrorCode(
    159809,
    'Error when create membership cards',
  ),
  MEMBERSHIP_CARD_USER_IS_NOT_THE_ORDER_OWNER: createErrorCode(
    159810,
    'Membership card user is not the order owner',
  ),
};
