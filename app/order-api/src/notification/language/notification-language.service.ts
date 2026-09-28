import { Injectable } from '@nestjs/common';
import { NotificationMessageCode } from '../notification.constants';

@Injectable()
export class NotificationLanguageService {
  private messages = {
    vi: {
      [NotificationMessageCode.VOUCHER_BIRTHDAY_RECEIVED]: {
        title: 'Chúc mừng sinh nhật!',
        body: 'Bạn vừa nhận được voucher {{voucherTitle}} (mã: {{voucherCode}}). Chúc bạn có một ngày sinh nhật vui vẻ!',
      },
      [NotificationMessageCode.VOUCHER_NEW_USER_RECEIVED]: {
        title: 'Chào mừng bạn!',
        body: 'Bạn vừa nhận được voucher {{voucherTitle}} (mã: {{voucherCode}}) dành cho thành viên mới. Chúc bạn mua sắm vui vẻ!',
      },
      [NotificationMessageCode.ORDER_NEEDS_PROCESSED]: {
        title: 'Đơn hàng cần xử lý',
        body: 'Đơn hàng #{{referenceNumber}} cần xử lý. Vui lòng xử lý sớm!',
      },
      [NotificationMessageCode.ORDER_NEEDS_DELIVERED]: {
        title: 'Đơn hàng cần giao',
        body: 'Đơn hàng #{{referenceNumber}} cần giao. Vui lòng giao hàng sớm!',
      },
      [NotificationMessageCode.ORDER_NEEDS_CANCELLED]: {
        title: 'Đơn hàng đã hủy',
        body: 'Đơn hàng #{{referenceNumber}} đã được hủy.',
      },
      [NotificationMessageCode.ORDER_NEEDS_READY_TO_GET]: {
        title: 'Đơn hàng sẵn sàng',
        body: 'Đơn hàng #{{referenceNumber}} đã sẵn sàng. Vui lòng tới quầy để nhận!',
      },
      [NotificationMessageCode.ORDER_BILL_FAILED_PRINTING]: {
        title: 'In hóa đơn lỗi',
        body: 'Hóa đơn #{{referenceNumber}} in lỗi. Vui lòng in lại thủ công!',
      },
      [NotificationMessageCode.ORDER_CHEF_ORDER_FAILED_PRINTING]: {
        title: 'In đơn hàng nhà bếp lỗi',
        body: 'Đơn hàng #{{referenceNumber}} in lỗi. Vui lòng in lại thủ công!',
      },
      [NotificationMessageCode.ORDER_LABEL_TICKET_FAILED_PRINTING]: {
        title: 'In nhãn dán lỗi',
        body: 'Nhãn dán cho đơn hàng #{{referenceNumber}} in lỗi. Vui lòng in lại thủ công!',
      },
      [NotificationMessageCode.CARD_ORDER_PAID]: {
        title: 'Thanh toán thành công',
        body: 'Đơn mua gift card {{cardTitle}} ({{orderCode}}) đã được thanh toán thành công.',
      },
      [NotificationMessageCode.TABLE_BOOKING_CREATED]: {
        title: 'Có yêu cầu đặt bàn mới',
        body: 'Yêu cầu đặt bàn từ SĐT {{customerPhoneNumber}} lúc {{bookingTime}} ({{seats}} khách) cần được xác nhận.',
      },
      [NotificationMessageCode.TABLE_BOOKING_CONFIRMED]: {
        title: 'Đặt bàn đã được xác nhận',
        body: 'Yêu cầu đặt bàn từ SĐT {{customerPhoneNumber}} lúc {{bookingTime}} đã được xác nhận.',
      },
    },
    en: {
      [NotificationMessageCode.VOUCHER_BIRTHDAY_RECEIVED]: {
        title: 'Happy Birthday!',
        body: 'You have received a voucher {{voucherTitle}} (code: {{voucherCode}}). Wishing you a wonderful birthday!',
      },
      [NotificationMessageCode.VOUCHER_NEW_USER_RECEIVED]: {
        title: 'Welcome!',
        body: 'You have received a new member voucher {{voucherTitle}} (code: {{voucherCode}}). Happy shopping!',
      },
      [NotificationMessageCode.ORDER_NEEDS_PROCESSED]: {
        title: 'Order needs processed',
        body: 'Order #{{referenceNumber}} needs to be processed. Please process it quickly!',
      },
      [NotificationMessageCode.ORDER_NEEDS_DELIVERED]: {
        title: 'Order needs delivered',
        body: 'Order #{{referenceNumber}} needs to be delivered. Please deliver it quickly!',
      },
      [NotificationMessageCode.ORDER_NEEDS_CANCELLED]: {
        title: 'Order is cancelled',
        body: 'Order #{{referenceNumber}} is cancelled.',
      },
      [NotificationMessageCode.ORDER_NEEDS_READY_TO_GET]: {
        title: 'Order needs ready to get',
        body: 'Order #{{referenceNumber}} is ready to get. Please get it quickly!',
      },
      [NotificationMessageCode.ORDER_BILL_FAILED_PRINTING]: {
        title: 'Order bill failed printing',
        body: 'Order #{{referenceNumber}} bill failed to print. Please print manually!',
      },
      [NotificationMessageCode.ORDER_CHEF_ORDER_FAILED_PRINTING]: {
        title: 'Order chef order failed printing',
        body: 'Order #{{referenceNumber}} chef order failed to print. Please print manually!',
      },
      [NotificationMessageCode.ORDER_LABEL_TICKET_FAILED_PRINTING]: {
        title: 'Order label ticket failed printing',
        body: 'Order #{{referenceNumber}} label ticket failed to print. Please print manually!',
      },
      [NotificationMessageCode.CARD_ORDER_PAID]: {
        title: 'Payment successful',
        body: 'Your gift card order {{cardTitle}} ({{orderCode}}) has been paid successfully.',
      },
      [NotificationMessageCode.TABLE_BOOKING_CREATED]: {
        title: 'New table booking request',
        body: 'A table booking from phone {{customerPhoneNumber}} at {{bookingTime}} for {{seats}} guest(s) needs confirmation.',
      },
      [NotificationMessageCode.TABLE_BOOKING_CONFIRMED]: {
        title: 'Table booking confirmed',
        body: 'The table booking from phone {{customerPhoneNumber}} at {{bookingTime}} has been confirmed.',
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
