import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const USER_NOT_FOUND = 'USER_NOT_FOUND';
export const ERROR_CREATE_USER = 'ERROR_CREATE_USER';
export const CANNOT_UPDATE_CUSTOMER_ROLE = 'CANNOT_UPDATE_CUSTOMER_ROLE';
export const INVALID_LANGUAGE = 'INVALID_LANGUAGE';
export const OWNER_NOT_A_CUSTOMER = 'OWNER_NOT_A_CUSTOMER';
export const USER_OWNED_BY_ANOTHER_SERVICE = 'USER_OWNED_BY_ANOTHER_SERVICE';
export type TUserErrorCodeKey =
  | typeof USER_NOT_FOUND
  | typeof CANNOT_UPDATE_CUSTOMER_ROLE
  | typeof ERROR_CREATE_USER
  | typeof INVALID_LANGUAGE
  | typeof OWNER_NOT_A_CUSTOMER
  | typeof USER_OWNED_BY_ANOTHER_SERVICE;
export type TUserErrorCode = Record<TUserErrorCodeKey, TErrorCodeValue>;

// 137000 - 138000
export const UserValidation: TUserErrorCode = {
  USER_NOT_FOUND: createErrorCode(137000, 'User not found'),
  ERROR_CREATE_USER: createErrorCode(137001, 'Error when creating user'),
  CANNOT_UPDATE_CUSTOMER_ROLE: createErrorCode(
    137002,
    'Can not update customer role',
  ),
  INVALID_LANGUAGE: createErrorCode(137003, 'Invalid language'),
  OWNER_NOT_A_CUSTOMER: createErrorCode(137004, 'Owner is not a customer'),
  // QD18 - danh tinh nay thuoc ve mot service KHAC (owner_service khac null
  // va khac 'terminal'). terminal khong duoc tu cap hang cuc bo cho ho, va
  // khong cho ho dang nhap nhu khach.
  USER_OWNED_BY_ANOTHER_SERVICE: createErrorCode(
    137005,
    'User belongs to another service',
  ),
};
