import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OrderItem } from './order-item.entity';
import { FindOneOptions, Repository } from 'typeorm';
import { OrderItemException } from './order-item.exception';
import { OrderItemValidation } from './order-item.validation';
import { Promotion } from 'src/promotion/promotion.entity';
import { Voucher } from 'src/voucher/entity/voucher.entity';
import {
  VoucherApplicabilityRule,
  VoucherType,
} from 'src/voucher/voucher.constant';
import { DiscountType } from 'src/order/order.constants';

@Injectable()
export class OrderItemUtils {
  constructor(
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
  ) {}

  async getOrderItem(options: FindOneOptions<OrderItem>): Promise<OrderItem> {
    const orderItem = await this.orderItemRepository.findOne({
      relations: [
        'order.branch',
        'variant.product',
        'variant.size',
        'order.voucher.voucherProducts.product',
      ],
      ...options,
    });
    if (!orderItem) {
      throw new OrderItemException(OrderItemValidation.ORDER_ITEM_NOT_FOUND);
    }
    return orderItem;
  }

  calculateSubTotal(
    orderItem: OrderItem,
    promotion?: Promotion,
    voucher?: Voucher,
  ): {
    subtotal: number;
    voucherValue: number;
    vatRate: number;
    vatValue: number;
    isPromotionApplied: boolean;
  } {
    let discountPromotion = 0;
    // isCustomPrice products use the staff-defined customPrice instead of variant.price
    const unitPrice =
      orderItem.customPrice != null && orderItem.variant?.product?.isCustomPrice
        ? orderItem.customPrice
        : orderItem.variant.price;
    const originalSubtotal = unitPrice * orderItem.quantity;

    if (orderItem.variant?.product?.isCustomPrice) {
      return {
        subtotal: originalSubtotal,
        voucherValue: 0,
        vatRate: 0,
        vatValue: 0,
        isPromotionApplied: false,
      };
    }

    let voucherValue = 0;
    let subtotal = originalSubtotal;
    let isPromotionApplied = false;

    if (promotion) {
      const percentPromotion = promotion.value;
      discountPromotion = (originalSubtotal * percentPromotion) / 100;
    }

    if (voucher) {
      if (
        voucher.applicabilityRule ===
        VoucherApplicabilityRule.AT_LEAST_ONE_REQUIRED
      ) {
        switch (voucher.type) {
          case VoucherType.SAME_PRICE_PRODUCT: {
            const sameProductValueTotal = voucher.value * orderItem.quantity;
            if (originalSubtotal > sameProductValueTotal) {
              voucherValue = originalSubtotal - sameProductValueTotal;
              subtotal = sameProductValueTotal;
            } else {
              // voucher value is greater than variant price, use price of variant
              subtotal = originalSubtotal;
              voucherValue = 0;
            }
            break;
          }
          case VoucherType.PERCENT_ORDER: {
            voucherValue = (originalSubtotal * voucher.value) / 100;
            subtotal = originalSubtotal - voucherValue;
            break;
          }
          case VoucherType.FIXED_VALUE: {
            voucherValue = voucher.value * orderItem.quantity;
            if (originalSubtotal > voucherValue) {
              subtotal = originalSubtotal - voucherValue;
            } else {
              subtotal = 0;
              voucherValue = originalSubtotal;
            }
            break;
          }
          default:
            subtotal = originalSubtotal - discountPromotion;
            isPromotionApplied = discountPromotion > 0;
            break;
        }
      } else if (
        voucher.applicabilityRule === VoucherApplicabilityRule.ALL_REQUIRED
      ) {
        switch (voucher.type) {
          case VoucherType.SAME_PRICE_PRODUCT: {
            const sameProductValueTotal = voucher.value * orderItem.quantity;
            if (originalSubtotal > sameProductValueTotal) {
              voucherValue = originalSubtotal - sameProductValueTotal;
              subtotal = sameProductValueTotal;
            } else {
              // voucher value is greater than variant price, use price of variant
              subtotal = originalSubtotal;
              voucherValue = 0;
            }
            break;
          }
          case VoucherType.PERCENT_ORDER: {
            // Applied per-item after promotion, before VAT (Phase 2 flow)
            const subtotalAfterPromotion = originalSubtotal - discountPromotion;
            voucherValue = (subtotalAfterPromotion * voucher.value) / 100;
            subtotal = subtotalAfterPromotion - voucherValue;
            isPromotionApplied = discountPromotion > 0;
            break;
          }
          default:
            subtotal = originalSubtotal - discountPromotion;
            isPromotionApplied = discountPromotion > 0;
            break;
        }
      } else {
        subtotal = originalSubtotal - discountPromotion;
        isPromotionApplied = discountPromotion > 0;
      }
    } else {
      subtotal = originalSubtotal - discountPromotion;
      isPromotionApplied = discountPromotion > 0;
    }

    // Apply VAT per item after all promotions and applicable vouchers
    const vatRate = orderItem.variant?.product?.vatRate ?? 0;
    const vatValue = Math.round((subtotal * vatRate) / 100);
    subtotal = Math.round(subtotal) + vatValue;
    voucherValue = Math.round(voucherValue);

    return { subtotal, voucherValue, vatRate, vatValue, isPromotionApplied };
  }

  /**
   * Calculate the subtotal cost of an order item.
   * @param orderItem order item.
   * @returns the subtotal cost of an order item.
   */
  calculateSubTotalCost(orderItem: OrderItem): number {
    return orderItem.variant.costPrice * orderItem.quantity;
  }

  /**
   * Update or Update order item: subtotal, voucherValue, discountType, originalSubtotal
   * @param voucher
   * @param orderItem
   * @param isAddVoucher
   * @returns
   */
  getUpdatedOrderItem(
    voucher: Voucher,
    orderItem: OrderItem,
    isAddVoucher: boolean,
  ): OrderItem {
    const unitPrice =
      orderItem.customPrice != null && orderItem.variant?.product?.isCustomPrice
        ? orderItem.customPrice
        : orderItem.variant.price;
    const originalSubtotal = orderItem.quantity * unitPrice;

    // default
    orderItem.voucherValue = 0;
    orderItem.discountType = DiscountType.NONE;
    orderItem.isAppliedPromotion = false;
    orderItem.isAppliedVoucher = false;

    if (isAddVoucher) {
      let appliedVoucher: Voucher = null;
      const voucherProduct = voucher?.voucherProducts.find(
        (voucherProduct) =>
          voucherProduct.product.id === orderItem.variant.product.id,
      );
      if (voucherProduct) {
        appliedVoucher = voucher;
      }

      // add voucher
      const { subtotal, voucherValue, vatRate, vatValue, isPromotionApplied } =
        this.calculateSubTotal(orderItem, orderItem.promotion, appliedVoucher);
      Object.assign(orderItem, {
        subtotal,
        originalSubtotal,
        vatRate,
        vatValue,
      });
      if (!orderItem.variant?.product?.isCustomPrice) {
        if (isPromotionApplied) {
          orderItem.isAppliedPromotion = true;
        }
        if (
          appliedVoucher?.applicabilityRule ===
          VoucherApplicabilityRule.ALL_REQUIRED
        ) {
          if (
            appliedVoucher?.type === VoucherType.SAME_PRICE_PRODUCT ||
            appliedVoucher?.type === VoucherType.PERCENT_ORDER
          ) {
            orderItem.voucherValue = voucherValue;
            orderItem.isAppliedVoucher = true;
          }
        }
        if (
          appliedVoucher?.applicabilityRule ===
          VoucherApplicabilityRule.AT_LEAST_ONE_REQUIRED
        ) {
          orderItem.voucherValue = voucherValue;
          orderItem.isAppliedVoucher = true;
        }
      }
    } else {
      // remove voucher
      const {
        subtotal,
        vatRate,
        vatValue,
        isPromotionApplied,
      } = this.calculateSubTotal(orderItem, orderItem.promotion, null);
      Object.assign(orderItem, {
        subtotal,
        originalSubtotal,
        vatRate,
        vatValue,
      });
      if (!orderItem.variant?.product?.isCustomPrice && isPromotionApplied) {
        orderItem.isAppliedPromotion = true;
      }
    }

    return orderItem;
  }
}
