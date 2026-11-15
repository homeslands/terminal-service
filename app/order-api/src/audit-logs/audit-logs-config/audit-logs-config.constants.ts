export enum IgnoreEntites {
  // Buoc 3.3: bon ten token (`RegisterOtpToken`, `VerifyEmailToken`,
  // `VerifyPhoneNumberToken`, `ForgotPasswordToken`) da roi khoi danh sach nay
  // cung voi bon tep entity. Enum nay loc theo TEN CLASS entity, nen giu ten
  // cua entity khong con ton tai chi lam nguoi doc sau tuong con bang.
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
