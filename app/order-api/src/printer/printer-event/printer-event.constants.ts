export const CREATE_PRINTER_EVENT_JOB = 'create-printer-event';

export enum PrinterEventType {
  CHEF_ORDER = 'chef-order',
  LABEL_TICKET = 'label-ticket',
  INVOICE = 'invoice',
}

export enum PrinterEventRetryStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
}

export enum PrinterEventMessageCode {
  CHEF_ORDER_FAILED_PRINTING = 'chef-order-failed-printing',
  LABEL_TICKET_FAILED_PRINTING = 'label-ticket-failed-printing',
  INVOICE_FAILED_PRINTING = 'invoice-failed-printing',
}
