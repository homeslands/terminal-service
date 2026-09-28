export enum UserLanguage {
  VI = 'vi',
  EN = 'en',
}

export enum UserRequirementKey {
  NEED_UPDATE_PASSWORD = 'NEED-UPDATE-PASSWORD',
  NEED_UPDATE_PHONE_NUMBER = 'NEED-UPDATE-PHONE-NUMBER',
}

export enum UserRequirementLevel {
  WARNING = 'warning',
  BLOCK = 'block',
}

export enum UserRequirementStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
}

export enum UserRequirementScope {
  INITIAL = 'initial', // level: block
  PERIODIC = 'periodic', // level: warning
}
