export enum IgnoreEntites {
  // one-time / short-lived auth tokens
  REGISTER_OTP_TOKEN = 'RegisterOtpToken',
  VERIFY_EMAIL_TOKEN = 'VerifyEmailToken',
  VERIFY_PHONE_NUMBER_TOKEN = 'VerifyPhoneNumberToken',
  FORGOT_PASSWORD_TOKEN = 'ForgotPasswordToken',
  // push notification device tokens
  FIREBASE_DEVICE_TOKEN = 'FirebaseDeviceToken',
  // third-party integration credentials / access tokens / secrets
  ACB_CONNECTOR_CONFIG = 'ACBConnectorConfig',
  ZALO_OA_CONNECTOR_CONFIG = 'ZaloOaConnectorConfig',
  ZALO_OA_CONNECTOR_HISTORY = 'ZaloOaConnectorHistory',
  //audit
  AUDIT_LOG = 'AuditLogs',
  AUDIT_LOG_CONFIG = 'AuditLogsConfig',
}
