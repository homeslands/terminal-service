import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

// Loi khi goi sang `shared-user` (architect-http.md muc 1.7, buoc 2.4). Khai
// SONG DOI o `trend` va `terminal` - cung ten, cung so (khong co package dung
// chung giua cac repo), giong INTERNAL_BATCH_LOOKUP_MAX. `trend-ui` va
// `terminal-ui` dich cung ma nay.
export const SHARED_USER_UNAVAILABLE = 'SHARED_USER_UNAVAILABLE';
export type TSharedUserServiceErrorCodeKey = typeof SHARED_USER_UNAVAILABLE;
export type TSharedUserServiceErrorCode = Record<
  TSharedUserServiceErrorCodeKey,
  TErrorCodeValue
>;

// 162000 - 163000
export const SharedUserServiceValidation: TSharedUserServiceErrorCode = {
  SHARED_USER_UNAVAILABLE: createErrorCode(
    162001,
    'Shared user service is unavailable',
  ),
};
