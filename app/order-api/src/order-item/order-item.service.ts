import { Inject, Injectable, Logger } from '@nestjs/common';
import { OrderItem } from './order-item.entity';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import {
  CreateOrderItemRequestDto,
  CreateOrderItemsBatchRequestDto,
  OrderItemResponseDto,
  updateOrderItemNoteRequestDto,
  UpdateOrderItemRequestDto,
} from './order-item.dto';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { OrderUtils } from 'src/order/order.utils';
import { OrderItemUtils } from './order-item.utils';
import { VariantUtils } from 'src/variant/variant.utils';
import { MenuItemUtils } from 'src/menu-item/menu-item.utils';
import moment from 'moment';
import { OrderItemException } from './order-item.exception';
import { OrderItemValidation } from './order-item.validation';
import { PromotionUtils } from 'src/promotion/promotion.utils';
import { MenuUtils } from 'src/menu/menu.utils';
import { Order } from 'src/order/order.entity';
import _ from 'lodash';
import { OrderScheduler } from 'src/order/order.scheduler';
import { OrderException } from 'src/order/order.exception';
import { OrderValidation } from 'src/order/order.validation';
import { MenuItemValidation } from 'src/menu-item/menu-item.validation';
import { MenuItemException } from 'src/menu-item/menu-item.exception';
import { VoucherUtils } from 'src/voucher/voucher.utils';
import { Voucher } from 'src/voucher/entity/voucher.entity';
import { EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PaymentUtils } from 'src/payment/payment.utils';
import { OrderStatus, OrderType } from 'src/order/order.constants';
import { RoleEnum } from 'src/role/role.enum';
import { AccumulatedPointService } from 'src/accumulated-point/accumulated-point.service';
import { FeatureFlagSystems } from 'src/feature-flag-system/feature-flag-system.constant';
import { FeatureSystemGroups } from 'src/feature-flag-system/feature-flag-system.constant';
import { FeatureFlagSystemService } from 'src/feature-flag-system/feature-flag-system.service';
import { ChefOrderUtils } from 'src/chef-order/chef-order.utils';

@Injectable()
export class OrderItemService {
  constructor(
    private readonly orderItemUtils: OrderItemUtils,
    private readonly variantUtils: VariantUtils,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly transactionManagerService: TransactionManagerService,
    private readonly orderUtils: OrderUtils,
    private readonly menuItemUtils: MenuItemUtils,
    private readonly promotionUtils: PromotionUtils,
    private readonly menuUtils: MenuUtils,
    private readonly orderScheduler: OrderScheduler,
    private readonly voucherUtils: VoucherUtils,
    private readonly paymentUtils: PaymentUtils,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    private readonly accumulatedPointService: AccumulatedPointService,
    private readonly featureFlagSystemService: FeatureFlagSystemService,
    private readonly chefOrderUtils: ChefOrderUtils,
  ) {}

  /**
   * Handles order item note update
   * @param {string} slug
   * @param {updateOrderItemNoteRequestDto} requestData
   * @returns {Promise<OrderItemResponseDto>} Result when updating order item note
   * @throws {OrderItemException} Error when updating order item note error
   *
   */
  async updateOrderItemNote(
    slug: string,
    requestData: updateOrderItemNoteRequestDto,
  ): Promise<OrderItemResponseDto> {
    const context = `${OrderItemService.name}.${this.updateOrderItemNote.name}`;
    const orderItem = await this.orderItemUtils.getOrderItem({
      where: { slug },
    });

    orderItem.note = requestData.note;

    const updatedOrderItem =
      await this.transactionManagerService.execute<OrderItem>(
        async (manager) => {
          return await manager.save(orderItem);
        },
        (result) => {
          this.logger.log(
            `Order item note updated: ${result.variant?.product?.name}`,
            context,
          );
        },
        (error) => {
          this.logger.error(
            `Error when updating order item note: ${error.message}`,
            error.stack,
            context,
          );
          throw new OrderItemException(
            OrderItemValidation.UPDATE_ORDER_ITEM_ERROR,
          );
        },
      );

    return this.mapper.map(updatedOrderItem, OrderItem, OrderItemResponseDto);
  }

  /**
   * Handles order item update
   * @param {string} slug
   * @param {UpdateOrderItemRequestDto} requestData
   * @returns {Promise<OrderItemResponseDto>} Result when updating order item
   * @throws {OrderItemException} Error when updating order item error
   * @throws {OrderException} Error when updating order error
   */
  async updateOrderItem(
    slug: string,
    requestData: UpdateOrderItemRequestDto,
    requestUserRole?: string | null,
    requesterId?: string,
  ): Promise<OrderItemResponseDto> {
    const context = `${OrderItemService.name}.${this.updateOrderItem.name}`;

    let orderItem = await this.orderItemUtils.getOrderItem({
      where: { slug },
      relations: [
        'order.owner',
        'order.branch',
        'order.payment',
        'order.voucher.voucherProducts.product',
        'variant.product',
        'variant.size',
      ],
    });

    if (!orderItem.order) {
      this.logger.warn('Order not found', context);
      throw new OrderException(OrderValidation.ORDER_NOT_FOUND);
    }

    if (
      requestUserRole === RoleEnum.Customer &&
      orderItem.order.owner?.id !== requesterId
    ) {
      this.logger.warn(
        `Customer ${requesterId} is not the owner of the order`,
        context,
      );
      throw new OrderItemException(
        OrderItemValidation.NOT_PERMISSION_TO_UPDATE_ORDER_ITEM,
      );
    }

    if (
      orderItem.customPrice != null &&
      orderItem.variant?.product?.isCustomPrice
    ) {
      this.logger.warn(
        `Cannot change quantity of custom price order item ${orderItem.slug}`,
        context,
      );
      throw new OrderException(
        OrderValidation.CUSTOM_PRICE_ORDER_CANNOT_CHANGE_QUANTITY,
      );
    }

    // check feature flag
    if (orderItem.order.type === OrderType.AT_TABLE) {
      await this.featureFlagSystemService.validateFeatureFlag(
        FeatureSystemGroups.ORDER,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.key,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.children.AT_TABLE.key,
      );
    }
    if (orderItem.order.type === OrderType.TAKE_OUT) {
      await this.featureFlagSystemService.validateFeatureFlag(
        FeatureSystemGroups.ORDER,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.key,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.children.TAKE_OUT.key,
      );
    }
    if (orderItem.order.type === OrderType.DELIVERY) {
      await this.featureFlagSystemService.validateFeatureFlag(
        FeatureSystemGroups.ORDER,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.key,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.children.DELIVERY.key,
      );
    }

    if (requestData.quantity === Infinity) {
      this.logger.warn(
        OrderValidation.REQUEST_QUANTITY_MUST_OTHER_INFINITY.message,
        context,
      );
      throw new OrderException(
        OrderValidation.REQUEST_QUANTITY_MUST_OTHER_INFINITY,
      );
    }

    if (!requestData.action) {
      this.logger.warn('Action is required', context);
      throw new OrderItemException(OrderItemValidation.INVALID_ACTION);
    }

    if (orderItem.order.status !== OrderStatus.PENDING) {
      this.logger.warn(
        `Order item ${orderItem.slug} is not allowed to update`,
        context,
      );
      throw new OrderException(OrderValidation.ORDER_IS_NOT_PENDING);
    }

    // Đổi variant => đổi size trong cùng sản phẩm đó
    // => Không cần check lại voucher có hiệu lực cho sản phẩm hay không
    const variant = await this.variantUtils.getVariant({
      where: { slug: requestData.variant },
    });

    // validate gift product + order status
    if (!requestUserRole || requestUserRole === RoleEnum.Customer) {
      if (variant.product?.isGift) {
        this.logger.warn(
          `Gift product ${variant.product.slug} is not allowed for customer`,
          context,
        );
        throw new OrderException(OrderValidation.GIFT_PRODUCT_NOT_ALLOWED);
      }
      if (variant.product?.isCustomPrice) {
        this.logger.warn(
          `Custom price product ${variant.product.slug} is not allowed for customer`,
          context,
        );
        throw new OrderException(
          OrderValidation.CUSTOM_PRICE_PRODUCT_NOT_ALLOWED,
        );
      }
    }

    // # Check promotion
    const date = new Date(orderItem.order.createdAt);
    date.setHours(7, 0, 0, 0);

    const menu = await this.menuUtils.getMenu({
      where: {
        branch: { id: orderItem.order?.branch?.id },
        date,
      },
    });

    const menuItem = await this.menuItemUtils.getMenuItem({
      where: {
        menu: { slug: menu.slug },
        product: {
          id: variant.product?.id,
        },
      },
      relations: ['promotion'],
    });
    if (menuItem.isLocked) {
      this.logger.warn(MenuItemValidation.MENU_ITEM_IS_LOCKED.message, context);
      throw new MenuItemException(MenuItemValidation.MENU_ITEM_IS_LOCKED);
    }

    await this.promotionUtils.validatePromotionWithMenuItem(
      requestData.promotion,
      menuItem,
    );
    orderItem.variant = variant;
    orderItem.quantity = requestData.quantity;
    orderItem.promotion = menuItem.promotion;

    const subtotalCost = this.orderItemUtils.calculateSubTotalCost(orderItem);
    Object.assign(orderItem, {
      subtotalCost,
      isGift: variant.product.isGift,
    });

    //update: subtotal, voucherValue, discountType, originalSubtotal
    orderItem = this.orderItemUtils.getUpdatedOrderItem(
      orderItem.order?.voucher,
      orderItem,
      true, // isAddVoucher
    );

    // const updatedOrderItem =
    //   await this.transactionManagerService.execute<OrderItem>(
    //     async (manager) => {
    //       // Remove payment
    //       if (orderItem.order.payment) {
    //         await this.paymentUtils.cancelPayment(orderItem.order.payment.slug);
    //       }

    //       // Update order item
    //       const updatedOrderItem = await manager.save(orderItem);

    //       // Update menu item
    //       const menuItem = await this.menuItemUtils.getCurrentMenuItem(
    //         orderItem,
    //         date,
    //         // If when increment order item, we need to decrement menu item
    //         requestData.action === 'increment' ? 'decrement' : 'increment',
    //       );
    //       await manager.save(menuItem);
    //       return updatedOrderItem;
    //     },
    //     (result) => {
    //       this.logger.log(
    //         `Order item updated: ${result.variant?.product?.name}`,
    //         context,
    //       );
    //     },
    //     (error) => {
    //       this.logger.error(
    //         `Error when updating order item: ${error.message}`,
    //         error.stack,
    //         context,
    //       );
    //       throw new OrderItemException(
    //         OrderItemValidation.UPDATE_ORDER_ITEM_ERROR,
    //       );
    //     },
    //   );

    // Update order subtotal
    const order = await this.orderUtils.getOrder({
      where: {
        id: orderItem.order.id,
      },
    });

    for (let i = 0; i < order.orderItems.length; i++) {
      if (order.orderItems[i].id === orderItem.id) {
        order.orderItems[i] = orderItem;
        break;
      }
    }

    const voucher: Voucher = order.voucher;
    if (voucher) {
      const isMinOrderValueVoucherValid =
        await this.voucherUtils.validateMinOrderValueForUpdateOrderItem(
          voucher,
          order,
        );

      const isVoucherTimeValid =
        await this.voucherUtils.isVoucherTimeValid(voucher);

      const isLimitItemsVoucherValid =
        this.voucherUtils.validateLimitItemsForUpdate(
          voucher,
          order.orderItems,
        );

      if (
        !isMinOrderValueVoucherValid ||
        !isVoucherTimeValid ||
        !isLimitItemsVoucherValid
      ) {
        voucher.remainingUsage += 1;
        order.voucher = null;

        // remove voucher value from order items
        const updatedOrderItems = order.orderItems.map((orderItem) => {
          const updatedOrderItem = this.orderItemUtils.getUpdatedOrderItem(
            null,
            orderItem,
            false, // is add voucher
          );
          return updatedOrderItem;
        });
        order.orderItems = updatedOrderItems;
      }
    }

    const {
      subtotal: subtotalOrder,
      originalSubtotal: originalSubtotalOrder,
      totalVatValue,
    } = await this.orderUtils.getOrderSubtotal(order, order.voucher);

    order.subtotal = subtotalOrder;
    order.originalSubtotal = originalSubtotalOrder;
    order.totalVatValue = totalVatValue;

    orderItem.order = order;
    await this.transactionManagerService.execute(
      async (manager) => {
        // Remove payment
        if (order.payment) {
          await this.paymentUtils.cancelPayment(order.payment.slug);
        }

        await this.menuItemUtils.getCurrentMenuItem(
          orderItem,
          date,
          // If when increment order item, we need to decrement menu item
          requestData.action === 'increment' ? 'decrement' : 'increment',
          1,
          manager,
        );

        // ------------------------------------------------------------

        if (voucher) await manager.save(voucher);

        // Cancel accumulated points reservation
        await this.accumulatedPointService.handleCancelReservation(
          order.id,
          null,
        );
        // Update accumulated points to use in order
        order.accumulatedPointsToUse = 0;

        await manager.save(order);
      },
      () => {
        this.logger.log(`Order updated: ${order.slug}`, context);
      },
      (error) => {
        this.logger.error(
          `Error when updating order: ${error.message}`,
          error.stack,
          context,
        );
        throw new OrderException(
          OrderValidation.UPDATE_ORDER_ERROR,
          error.message,
        );
      },
    );
    return this.mapper.map(orderItem, OrderItem, OrderItemResponseDto);
  }

  /**
   * Handles order item deletion
   * @param {string} slug
   * @returns {Promise<void>} Result when deleting order item
   */
  async deleteOrderItem(
    slug: string,
    requestUserRole?: string | null,
    requesterId?: string,
  ): Promise<void> {
    const context = `${OrderItemService.name}.${this.deleteOrderItem.name}`;
    const orderItem = await this.orderItemUtils.getOrderItem({
      where: { slug },
    });

    // check feature flag
    if (orderItem.order?.type === OrderType.AT_TABLE) {
      await this.featureFlagSystemService.validateFeatureFlag(
        FeatureSystemGroups.ORDER,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.key,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.children.AT_TABLE.key,
      );
    }
    if (orderItem.order?.type === OrderType.TAKE_OUT) {
      await this.featureFlagSystemService.validateFeatureFlag(
        FeatureSystemGroups.ORDER,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.key,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.children.TAKE_OUT.key,
      );
    }
    if (orderItem.order?.type === OrderType.DELIVERY) {
      await this.featureFlagSystemService.validateFeatureFlag(
        FeatureSystemGroups.ORDER,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.key,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.children.DELIVERY.key,
      );
    }

    const { slug: orderSlug } = orderItem.order;
    const order = await this.orderUtils.getOrder({
      where: { slug: orderSlug },
    });

    if (
      requestUserRole === RoleEnum.Customer &&
      order.owner?.id !== requesterId
    ) {
      this.logger.warn(
        `Customer ${requesterId} is not the owner of order ${orderSlug}`,
        context,
      );
      throw new OrderItemException(
        OrderItemValidation.NOT_PERMISSION_TO_DELETE_ORDER_ITEM,
      );
    }

    if (order.status !== OrderStatus.PENDING) {
      this.logger.warn(
        `Order item ${orderItem.slug} is not allowed to delete`,
        context,
      );
      throw new OrderException(OrderValidation.ORDER_IS_NOT_PENDING);
    }

    // validate gift product + order status
    if (!requestUserRole || requestUserRole === RoleEnum.Customer) {
      if (orderItem.variant?.product?.isGift) {
        this.logger.warn(
          `Gift product ${orderItem.variant.product.slug} is not allowed for customer`,
          context,
        );
        throw new OrderException(OrderValidation.GIFT_PRODUCT_NOT_ALLOWED);
      }
      if (orderItem.variant?.product?.isCustomPrice) {
        this.logger.warn(
          `Custom price product ${orderItem.variant.product.slug} is not allowed for customer`,
          context,
        );
        throw new OrderException(
          OrderValidation.CUSTOM_PRICE_PRODUCT_NOT_ALLOWED,
        );
      }
    }

    const updatedOrder = await this.transactionManagerService.execute<Order>(
      async (manager) => {
        // Remove payment
        if (order.payment) {
          await this.paymentUtils.cancelPayment(order.payment.slug);
        }

        // Update menu items
        await this.menuItemUtils.getCurrentMenuItem(
          orderItem,
          new Date(moment().format('YYYY-MM-DD')),
          'increment',
          orderItem.quantity,
          manager,
        );

        // Remove order item
        // Can not use manager.remove(orderItem) because order item is not managed by manager
        // We get order item from order repository so we need to remove it from order item repository
        orderItem.order = null;
        order.orderItems = order.orderItems.filter(
          (item) => item.slug !== orderItem.slug,
        );
        await manager.softRemove(orderItem);

        // validate voucher
        const voucher: Voucher = order.voucher;
        if (voucher) {
          // Before, check voucher product
          const isVoucherProductValid =
            await this.voucherUtils.validateVoucherProductForDeleteOrderItem(
              voucher,
              order.orderItems.map((item) => item.variant.slug),
            );

          const isVoucherTimeValid =
            await this.voucherUtils.isVoucherTimeValid(voucher);

          if (!isVoucherProductValid || !isVoucherTimeValid) {
            // Remove voucher from order
            order.voucher.remainingUsage += 1;
            order.voucher = null;

            const updatedOrderItems = order.orderItems.map((orderItem) => {
              const updatedOrderItem = this.orderItemUtils.getUpdatedOrderItem(
                null,
                orderItem,
                false, // is add voucher
              );
              return updatedOrderItem;
            });
            order.orderItems = updatedOrderItems;

            const { subtotal, originalSubtotal } =
              await this.orderUtils.getOrderSubtotal(order, null);
            order.subtotal = subtotal;
            order.originalSubtotal = originalSubtotal;
          } else {
            // After, check voucher min value
            const isVoucherMinValueValid =
              await this.voucherUtils.validateMinOrderValueForUpdateOrderItem(
                voucher,
                order,
              );
            if (!isVoucherMinValueValid) {
              if (!_.isEmpty(order.orderItems)) {
                voucher.remainingUsage += 1;
                order.voucher = null;

                const updatedOrderItems = order.orderItems.map((item) => {
                  return this.orderItemUtils.getUpdatedOrderItem(
                    null,
                    item,
                    false,
                  );
                });
                order.orderItems = updatedOrderItems;
              }
            }
          }
        }
        // Update order
        const {
          subtotal: subtotalOrder,
          originalSubtotal: originalSubtotalOrder,
          totalVatValue,
        } = await this.orderUtils.getOrderSubtotal(order, order.voucher);
        order.subtotal = subtotalOrder;
        order.originalSubtotal = originalSubtotalOrder;
        order.totalVatValue = totalVatValue;

        if (voucher) await manager.save(voucher);

        // Cancel accumulated points reservation
        await this.accumulatedPointService.handleCancelReservation(
          order.id,
          null,
        );
        // Update accumulated points to use in order
        order.accumulatedPointsToUse = 0;

        return await manager.save(order);
      },
      () => {
        this.logger.log(`Order item deleted: ${slug}`, context);
      },
      (error) => {
        this.logger.error(
          `Error when deleting order item: ${error.message}`,
          error.stack,
          context,
        );
        throw new OrderItemException(
          OrderItemValidation.DELETE_ORDER_ITEM_ERROR,
        );
      },
    );

    // Delete order if no order items
    if (_.isEmpty(updatedOrder.orderItems)) {
      this.orderScheduler.handleDeleteOrder(orderSlug, 0);
    }
  }

  /**
   * Handles order item creation
   * @param {CreateOrderItemRequestDto} requestData
   * @returns {Promise<OrderItemResponseDto>} Result when creating order item
   */
  /**
   * Validate and prepare a single order item in-memory.
   * Mutates `order` directly (pushes new item, may remove voucher).
   * No DB writes — caller is responsible for persistence.
   */
  private async _buildOrderItemData(
    requestData: CreateOrderItemRequestDto,
    requestUserRole: string | null | undefined,
    order: Order,
  ): Promise<{
    orderItem: OrderItem;
    date: Date;
    updatedVoucher: Voucher | null;
  }> {
    const context = `${OrderItemService.name}._buildOrderItemData`;

    if (order.type === OrderType.AT_TABLE) {
      await this.featureFlagSystemService.validateFeatureFlag(
        FeatureSystemGroups.ORDER,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.key,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.children.AT_TABLE.key,
      );
    }
    if (order.type === OrderType.TAKE_OUT) {
      await this.featureFlagSystemService.validateFeatureFlag(
        FeatureSystemGroups.ORDER,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.key,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.children.TAKE_OUT.key,
      );
    }
    if (order.type === OrderType.DELIVERY) {
      await this.featureFlagSystemService.validateFeatureFlag(
        FeatureSystemGroups.ORDER,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.key,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.children.DELIVERY.key,
      );
    }

    if (order.status !== OrderStatus.PENDING) {
      this.logger.warn(
        `Order ${order.slug} is not allowed to create order item`,
        context,
      );
      throw new OrderException(OrderValidation.ORDER_IS_NOT_PENDING);
    }

    const variant = await this.variantUtils.getVariant({
      where: { slug: requestData.variant },
    });

    if (!requestUserRole || requestUserRole === RoleEnum.Customer) {
      if (variant.product?.isGift) {
        this.logger.warn(
          `Gift product ${variant.product.slug} is not allowed for customer`,
          context,
        );
        throw new OrderException(OrderValidation.GIFT_PRODUCT_NOT_ALLOWED);
      }
      if (variant.product?.isCustomPrice) {
        this.logger.warn(
          `Custom price product ${variant.product.slug} is not allowed for customer`,
          context,
        );
        throw new OrderException(
          OrderValidation.CUSTOM_PRICE_PRODUCT_NOT_ALLOWED,
        );
      }
    }

    const orderHasCustomPrice = order.orderItems.some(
      (item) =>
        item.customPrice != null && item.variant?.product?.isCustomPrice,
    );
    const orderHasNormal = order.orderItems.some(
      (item) =>
        !(item.customPrice != null && item.variant?.product?.isCustomPrice),
    );
    const newItemIsCustomPrice = variant.product?.isCustomPrice;

    if (orderHasCustomPrice) {
      this.logger.warn(
        'Cannot add item to an order that contains a custom price product',
        context,
      );
      throw new OrderException(
        OrderValidation.CUSTOM_PRICE_ORDER_CANNOT_ADD_ITEM,
      );
    }

    if (newItemIsCustomPrice && orderHasNormal) {
      this.logger.warn(
        'Cannot mix custom price and normal products in the same order',
        context,
      );
      throw new OrderException(
        OrderValidation.CANNOT_MIX_CUSTOM_PRICE_AND_NORMAL_PRODUCT,
      );
    }

    if (requestData.quantity === Infinity) {
      this.logger.warn(
        OrderValidation.REQUEST_QUANTITY_MUST_OTHER_INFINITY.message,
        context,
      );
      throw new OrderException(
        OrderValidation.REQUEST_QUANTITY_MUST_OTHER_INFINITY,
      );
    }

    const date = new Date(order.createdAt);
    date.setHours(7, 0, 0, 0);

    const menu = await this.menuUtils.getMenu({
      where: { branch: { id: order.branch.id }, date },
    });

    const menuItem = await this.menuItemUtils.getMenuItem({
      where: {
        menu: { slug: menu.slug },
        product: { id: variant.product?.id },
      },
      relations: ['promotion'],
    });
    if (menuItem.isLocked) {
      this.logger.warn(MenuItemValidation.MENU_ITEM_IS_LOCKED.message, context);
      throw new MenuItemException(MenuItemValidation.MENU_ITEM_IS_LOCKED);
    }

    await this.promotionUtils.validatePromotionWithMenuItem(
      requestData.promotion,
      menuItem,
    );

    let orderItem = this.mapper.map(
      requestData,
      CreateOrderItemRequestDto,
      OrderItem,
    );

    orderItem.variant = variant;
    orderItem.order = order;
    orderItem.promotion = menuItem.promotion;

    const subtotalCost = this.orderItemUtils.calculateSubTotalCost(orderItem);
    Object.assign(orderItem, {
      subtotalCost,
      isGift: variant.product.isGift,
    });

    orderItem = this.orderItemUtils.getUpdatedOrderItem(
      order.voucher,
      orderItem,
      true,
    );
    order.orderItems.push(orderItem);

    let updatedVoucher: Voucher = null;

    if (order.voucher) {
      const isVoucherProductValid =
        await this.voucherUtils.validateVoucherProductForCreateOrderItem(
          order.voucher,
          requestData.variant,
        );
      const isVoucherTimeValid = await this.voucherUtils.isVoucherTimeValid(
        order.voucher,
      );
      const isLimitItemsVoucherValid =
        this.voucherUtils.validateLimitItemsForUpdate(
          order.voucher,
          order.orderItems,
        );

      if (
        !isVoucherProductValid ||
        !isVoucherTimeValid ||
        !isLimitItemsVoucherValid
      ) {
        order.voucher.remainingUsage += 1;
        updatedVoucher = order.voucher;
        order.voucher = null;

        order.orderItems = order.orderItems.map((oi) =>
          this.orderItemUtils.getUpdatedOrderItem(null, oi, false),
        );
      }
    }
    const {
      subtotal: subtotalOrder,
      originalSubtotal: originalSubtotalOrder,
      totalVatValue,
    } = await this.orderUtils.getOrderSubtotal(order, order.voucher);
    order.subtotal = subtotalOrder;
    order.originalSubtotal = originalSubtotalOrder;
    order.totalVatValue = totalVatValue;

    return { orderItem, date, updatedVoucher };
  }

  /**
   * Persist a prepared order item using the provided EntityManager.
   * Must be called inside an active transaction.
   */
  private async _persistOrderItemData(
    manager: EntityManager,
    order: Order,
    orderItem: OrderItem,
    date: Date,
    updatedVoucher: Voucher | null,
  ): Promise<void> {
    if (order.payment) {
      await this.paymentUtils.cancelPayment(order.payment.slug);
    }

    await this.menuItemUtils.getCurrentMenuItem(
      orderItem,
      date,
      'decrement',
      1,
      manager,
    );

    await this.accumulatedPointService.handleCancelReservation(order.id, null);
    order.accumulatedPointsToUse = 0;

    await manager.save(order);

    if (updatedVoucher) {
      await manager.save(updatedVoucher);
    }
  }

  private async _prepareAndSaveOrderItem(
    requestData: CreateOrderItemRequestDto,
    requestUserRole?: string | null,
  ): Promise<{ orderItem: OrderItem; order: Order }> {
    const context = `${OrderItemService.name}._prepareAndSaveOrderItem`;

    const order = await this.orderUtils.getOrder({
      where: { slug: requestData.order },
    });

    const { orderItem, date, updatedVoucher } = await this._buildOrderItemData(
      requestData,
      requestUserRole,
      order,
    );

    await this.transactionManagerService.execute<void>(
      async (manager) => {
        await this._persistOrderItemData(
          manager,
          order,
          orderItem,
          date,
          updatedVoucher,
        );
      },
      () => {
        this.logger.log(`Order item created for order ${order.slug}`, context);
      },
      (error) => {
        this.logger.error(
          `Error when creating order item: ${error.message}`,
          error.stack,
          context,
        );
        throw new OrderItemException(
          OrderItemValidation.CREATE_ORDER_ITEM_ERROR,
        );
      },
    );

    return { orderItem, order };
  }

  async createOrderItem(
    requestData: CreateOrderItemRequestDto,
    requestUserRole?: string | null,
  ): Promise<OrderItemResponseDto> {
    const { orderItem, order } = await this._prepareAndSaveOrderItem(
      requestData,
      requestUserRole,
    );

    if (order.type === OrderType.AT_TABLE) {
      await this.chefOrderUtils.createChefOrder(order.id, false, [
        orderItem.id,
      ]);
    }

    return this.mapper.map(orderItem, OrderItem, OrderItemResponseDto);
  }

  async createOrderItemsBatch(
    requestData: CreateOrderItemsBatchRequestDto,
    requestUserRole?: string | null,
  ): Promise<OrderItemResponseDto[]> {
    const context = `${OrderItemService.name}.createOrderItemsBatch`;

    if (requestData.orderItems.length === 0) return [];

    // All items must belong to the same order
    const orderSlug = requestData.orderItems[0].order;
    if (requestData.orderItems.some((dto) => dto.order !== orderSlug)) {
      throw new OrderItemException(OrderItemValidation.CREATE_ORDER_ITEM_ERROR);
    }

    const order = await this.orderUtils.getOrder({
      where: { slug: orderSlug },
    });

    // Phase 1: validate + prepare all items sequentially.
    // Each call mutates `order` in-memory so the next item sees updated state
    // (e.g. items already queued, voucher already removed).
    type PreparedItem = {
      orderItem: OrderItem;
      date: Date;
      updatedVoucher: Voucher | null;
    };
    const allPrepared: PreparedItem[] = [];

    for (const dto of requestData.orderItems) {
      const prepared = await this._buildOrderItemData(
        dto,
        requestUserRole,
        order,
      );
      allPrepared.push(prepared);
    }

    // Phase 2: ONE atomic transaction — saves all items and side-effects together.
    // cancelPayment and cancelReservation are called once for the whole batch.
    await this.transactionManagerService.execute<void>(
      async (manager) => {
        if (order.payment) {
          await this.paymentUtils.cancelPayment(order.payment.slug);
        }

        for (const { orderItem, date } of allPrepared) {
          await this.menuItemUtils.getCurrentMenuItem(
            orderItem,
            date,
            'decrement',
            1,
            manager,
          );
        }

        await this.accumulatedPointService.handleCancelReservation(
          order.id,
          null,
        );
        order.accumulatedPointsToUse = 0;

        // Cascade-saves all new order items and assigns their IDs in-place
        await manager.save(order);

        // At most one voucher update across the whole batch
        const voucherUpdate = allPrepared
          .map((p) => p.updatedVoucher)
          .find(Boolean);
        if (voucherUpdate) {
          await manager.save(voucherUpdate);
        }
      },
      () => {
        this.logger.log(
          `Batch of ${allPrepared.length} order items created for order ${order.slug}`,
          context,
        );
      },
      (error) => {
        this.logger.error(
          `Error creating batch order items: ${error.message}`,
          error.stack,
          context,
        );
        throw new OrderItemException(
          OrderItemValidation.CREATE_ORDER_ITEM_ERROR,
        );
      },
    );

    // Phase 3: ONE chef order for the whole batch (IDs assigned after Phase 2)
    if (order.type === OrderType.AT_TABLE) {
      await this.chefOrderUtils.createChefOrder(
        order.id,
        false,
        allPrepared.map((p) => p.orderItem.id),
      );
    }

    return allPrepared.map((p) =>
      this.mapper.map(p.orderItem, OrderItem, OrderItemResponseDto),
    );
  }
}
