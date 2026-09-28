export enum ZaloOaStrategy {
  VERIFY_ACCOUNT = 'verify-account',
  RESET_PASSWORD = 'reset-password',
}

export enum SMSChannel {
  ZALO = 'zalo',
  SMS = 'sms',
}

export enum ZaloAoStatusCode {
  SUCCESS = '100',
  AUTHENTICATION_FAILED = '101',
  INVALID_TEMPLATE_ID = '789',
}

export enum SmsStatusNumber {
  WAITING_FOR_APPROVAL = '1',
  WAITING_FOR_SEND = '2',
  REJECTED = '4',
  SENT = '5',
  WAITING_FOR_REPORT = '7', // sent but not received report
}

export const SmsStatusStringRecord: Record<SmsStatusNumber, string> = {
  [SmsStatusNumber.WAITING_FOR_APPROVAL]: 'waiting-for-approval',
  [SmsStatusNumber.WAITING_FOR_SEND]: 'waiting-for-send',
  [SmsStatusNumber.REJECTED]: 'rejected',
  [SmsStatusNumber.SENT]: 'sent',
  [SmsStatusNumber.WAITING_FOR_REPORT]: 'waiting-for-report',
};

export enum SmsTypeNumber {
  ADVERTISING = '1',
  CUSTOMER_CARE = '2',
  VIBER = '23',
  PRIORITIZED_ZALO = '24',
  NORMAL_ZALO = '25',
}

export const SmsTypeStringRecord: Record<SmsTypeNumber, string> = {
  [SmsTypeNumber.ADVERTISING]: 'advertising',
  [SmsTypeNumber.CUSTOMER_CARE]: 'customer-care',
  [SmsTypeNumber.VIBER]: 'viber',
  [SmsTypeNumber.PRIORITIZED_ZALO]: 'prioritized-zalo',
  [SmsTypeNumber.NORMAL_ZALO]: 'normal-zalo',
};

export enum TelecomProviderNumber {
  VIETTEL = '1',
  MOBI = '2',
  VINA = '3',
  VIETNAM_MOBILE = '4',
  GTEL = '5',
  ITEL = '6',
  REDDI = '7',
}

export const TelecomProviderStringRecord: Record<
  TelecomProviderNumber,
  string
> = {
  [TelecomProviderNumber.VIETTEL]: 'viettel',
  [TelecomProviderNumber.MOBI]: 'mobi',
  [TelecomProviderNumber.VINA]: 'vina',
  [TelecomProviderNumber.VIETNAM_MOBILE]: 'vietnam-mobile',
  [TelecomProviderNumber.GTEL]: 'gtel',
  [TelecomProviderNumber.ITEL]: 'itel',
  [TelecomProviderNumber.REDDI]: 'reddi',
};

export const VerifyAccountContent = `(TrendCoffee) Ma xac thuc cua ban la: {otp}. Day la ma xac thuc tai khoan tai website trendcoffee.net . Khong chia se ma nay voi bat ky ai. Ma nay se het han vao luc {expireTime}.`;
export const fillVerifyAccountContent = (
  otp: string,
  expireTime: string,
): string => {
  return VerifyAccountContent.replace('{otp}', otp).replace(
    '{expireTime}',
    expireTime,
  );
};
export const ResetPasswordContent = `(TrendCoffee) Ma xac thuc cua ban la: {otp}. Day la ma xac thuc dat lai mat khau tai khoan tai website trendcoffee.net . Khong chia se ma nay voi bat ky ai. Ma nay se het han vao luc {expireTime}.`;
export const fillResetPasswordContent = (
  otp: string,
  expireTime: string,
): string => {
  return ResetPasswordContent.replace('{otp}', otp).replace(
    '{expireTime}',
    expireTime,
  );
};
