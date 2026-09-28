export enum AuditEvent {
  UPDATE = 'Update',
  DELETE = 'Delete',
  CREATE = 'Create',
}

export enum IgnoredFields {
  PASSWORD = 'password', // User.password
  API_KEY = 'apiKey', // PrinterConnector.apiKey — integration credential
}
