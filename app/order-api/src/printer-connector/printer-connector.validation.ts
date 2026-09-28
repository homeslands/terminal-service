import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const PRINTER_CONNECTOR_URL_INVALID = 'PRINTER_CONNECTOR_URL_INVALID';
export const PRINTER_CONNECTOR_API_KEY_INVALID =
  'PRINTER_CONNECTOR_API_KEY_INVALID';
export const CREATE_PRINTER_CONNECTOR_ERROR = 'CREATE_PRINTER_CONNECTOR_ERROR';
export const UPDATE_PRINTER_CONNECTOR_ERROR = 'UPDATE_PRINTER_CONNECTOR_ERROR';
export const DELETE_PRINTER_CONNECTOR_ERROR = 'DELETE_PRINTER_CONNECTOR_ERROR';
export const PRINTER_CONNECTOR_NOT_FOUND = 'PRINTER_CONNECTOR_NOT_FOUND';
export const BRANCH_SLUG_INVALID = 'BRANCH_SLUG_INVALID';
export const PRINTER_CONNECTOR_ALREADY_EXISTS =
  'PRINTER_CONNECTOR_ALREADY_EXISTS';
export const CREATE_PRINT_JOB_ERROR = 'CREATE_PRINT_JOB_ERROR';

export type TPrinterConnectorErrorCodeKey =
  | typeof PRINTER_CONNECTOR_URL_INVALID
  | typeof PRINTER_CONNECTOR_API_KEY_INVALID
  | typeof CREATE_PRINTER_CONNECTOR_ERROR
  | typeof UPDATE_PRINTER_CONNECTOR_ERROR
  | typeof DELETE_PRINTER_CONNECTOR_ERROR
  | typeof PRINTER_CONNECTOR_NOT_FOUND
  | typeof BRANCH_SLUG_INVALID
  | typeof PRINTER_CONNECTOR_ALREADY_EXISTS
  | typeof CREATE_PRINT_JOB_ERROR;

// 160101 - 160200
export type TPrinterConnectorErrorCode = Record<
  TPrinterConnectorErrorCodeKey,
  TErrorCodeValue
>;

export const PrinterConnectorValidation: TPrinterConnectorErrorCode = {
  PRINTER_CONNECTOR_URL_INVALID: createErrorCode(
    160101,
    'Printer connector URL is invalid',
  ),
  PRINTER_CONNECTOR_API_KEY_INVALID: createErrorCode(
    160102,
    'Printer connector API key is invalid',
  ),
  CREATE_PRINTER_CONNECTOR_ERROR: createErrorCode(
    160103,
    'Error when creating printer connector config',
  ),
  UPDATE_PRINTER_CONNECTOR_ERROR: createErrorCode(
    160104,
    'Error when updating printer connector config',
  ),
  DELETE_PRINTER_CONNECTOR_ERROR: createErrorCode(
    160105,
    'Error when deleting printer connector config',
  ),
  PRINTER_CONNECTOR_NOT_FOUND: createErrorCode(
    160106,
    'Printer connector config not found',
  ),
  BRANCH_SLUG_INVALID: createErrorCode(160107, 'Branch slug is invalid'),
  PRINTER_CONNECTOR_ALREADY_EXISTS: createErrorCode(
    160108,
    'Printer connector config already exists for this branch',
  ),
  CREATE_PRINT_JOB_ERROR: createErrorCode(
    160109,
    'Error when creating print job',
  ),
};
