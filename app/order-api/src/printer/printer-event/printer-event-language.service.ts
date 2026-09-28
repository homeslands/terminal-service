import { Injectable } from '@nestjs/common';
import { PrinterEventMessageCode } from './printer-event.constants';

@Injectable()
export class PrinterEventLanguageService {
  private messages = {
    vi: {
      [PrinterEventMessageCode.CHEF_ORDER_FAILED_PRINTING]: {
        title: 'In đơn hàng nhà bếp lỗi',
        body: 'Đơn hàng #{{referenceNumber}} nhà bếp in lỗi. Vui lòng in lại thủ công!',
      },
      [PrinterEventMessageCode.LABEL_TICKET_FAILED_PRINTING]: {
        title: 'In nhãn dán lỗi',
        body: 'Nhãn dán cho đơn hàng #{{referenceNumber}} in lỗi. Vui lòng in lại thủ công!',
      },
      [PrinterEventMessageCode.INVOICE_FAILED_PRINTING]: {
        title: 'In hóa đơn lỗi',
        body: 'Hóa đơn #{{referenceNumber}} in lỗi. Vui lòng in lại thủ công!',
      },
    },
    en: {
      [PrinterEventMessageCode.CHEF_ORDER_FAILED_PRINTING]: {
        title: 'Chef order failed printing',
        body: 'Chef order #{{referenceNumber}} failed to print. Please print manually!',
      },
      [PrinterEventMessageCode.LABEL_TICKET_FAILED_PRINTING]: {
        title: 'Label ticket failed printing',
        body: 'Label ticket for order #{{referenceNumber}} failed to print. Please print manually!',
      },
      [PrinterEventMessageCode.INVOICE_FAILED_PRINTING]: {
        title: 'Invoice failed printing',
        body: 'Invoice #{{referenceNumber}} failed to print. Please print manually!',
      },
    },
  };

  /**
   * Format notification message by language
   * @param {string} messageCode - The message code
   * @param {Record<string, any>} params - The parameters
   * @param {string} language - The language
   * @returns {string} The formatted message
   */
  format(
    messageCode: string,
    params: Record<string, any>,
    language: string = 'vi',
  ): { title: string; body: string } {
    const lang = language in this.messages ? language : 'vi';
    const template = this.messages[lang]?.[messageCode];

    if (!template) {
      return {
        title: 'Notification',
        body: messageCode,
      };
    }

    // Replace {{param}} with the actual value
    let title = template.title;
    let body = template.body;

    Object.keys(params).forEach((key) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      title = title.replace(regex, params[key]?.toString() || '');
      body = body.replace(regex, params[key]?.toString() || '');
    });

    return { title, body };
  }
}
