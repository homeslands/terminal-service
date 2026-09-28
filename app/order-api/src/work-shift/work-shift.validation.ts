import { createErrorCode, TErrorCode } from 'src/app/app.validation';

export const WORK_SHIFT_NOT_FOUND = 'WORK_SHIFT_NOT_FOUND';
export const WORK_SHIFT_BRANCH_HAS_ACTIVE = 'WORK_SHIFT_BRANCH_HAS_ACTIVE';
export const WORK_SHIFT_NO_ACTIVE = 'WORK_SHIFT_NO_ACTIVE';
export const WORK_SHIFT_BRANCH_NO_ACTIVE = 'WORK_SHIFT_BRANCH_NO_ACTIVE';
export const WORK_SHIFT_FORBIDDEN = 'WORK_SHIFT_FORBIDDEN';
export const WORK_SHIFT_NOT_ACTIVE = 'WORK_SHIFT_NOT_ACTIVE';
export const WORK_SHIFT_PAYMENT_FORBIDDEN_FOR_STAFF =
  'WORK_SHIFT_PAYMENT_FORBIDDEN_FOR_STAFF';

export type TWorkShiftErrorCodeKey =
  | typeof WORK_SHIFT_NOT_FOUND
  | typeof WORK_SHIFT_BRANCH_HAS_ACTIVE
  | typeof WORK_SHIFT_NO_ACTIVE
  | typeof WORK_SHIFT_BRANCH_NO_ACTIVE
  | typeof WORK_SHIFT_FORBIDDEN
  | typeof WORK_SHIFT_NOT_ACTIVE
  | typeof WORK_SHIFT_PAYMENT_FORBIDDEN_FOR_STAFF;

export const WorkShiftValidation: TErrorCode = {
  [WORK_SHIFT_NOT_FOUND]: createErrorCode(161000, 'Work shift not found'),
  [WORK_SHIFT_BRANCH_HAS_ACTIVE]: createErrorCode(
    161001,
    'Branch already has an active work shift',
  ),
  [WORK_SHIFT_NO_ACTIVE]: createErrorCode(
    161002,
    'No active work shift found for this cashier',
  ),
  [WORK_SHIFT_BRANCH_NO_ACTIVE]: createErrorCode(
    161003,
    'No active work shift for this branch. Please ask cashier to open a shift before payment.',
  ),
  [WORK_SHIFT_FORBIDDEN]: createErrorCode(
    161004,
    'You do not have permission to perform this action on this work shift',
  ),
  [WORK_SHIFT_NOT_ACTIVE]: createErrorCode(
    161005,
    'Work shift is not active',
  ),
  [WORK_SHIFT_PAYMENT_FORBIDDEN_FOR_STAFF]: createErrorCode(
    161006,
    'Staff are not allowed to create payments. Please contact cashier.',
  ),
};
