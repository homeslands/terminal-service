import { CardOrderStatus } from "./card-order.enum";

export const CANCEL_CARD_ORDER_JOB = 'CANCEL_CARD_ORDER_JOB';

export const createCancelCardOrderJobName = (id: string) =>
  `${CANCEL_CARD_ORDER_JOB}_${id}`;


export const CardOrderStatusMapper = {
  [CardOrderStatus.PENDING]: 'Chờ thanh toán',
  [CardOrderStatus.COMPLETED]: 'Đã hoàn thành', // payment success
  [CardOrderStatus.FAIL]: 'Thất bại', // payment fail
  [CardOrderStatus.CANCELLED]: 'Đã huỷ',
}