import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Order } from './order.entity';
import {
  Between,
  FindManyOptions,
  FindOptionsWhere,
  In,
  IsNull,
  Repository,
} from 'typeorm';
import {
  ChangeTableRequestDto,
  CreateOrderRequestDto,
  GetOrderRequestDto,
  OrderResponseDto,
  UpdateOrderRequestDto,
  UpdateOwnerOrderRequestDto,
  UpdateVoucherOrderRequestDto,
} from './order.dto';
import { OrderItem } from 'src/order-item/order-item.entity';
import {
  CreateOrderItemRequestDto,
  OrderItemResponseDto,
  StatusOrderItemResponseDto,
} from 'src/order-item/order-item.dto';
import { Table } from 'src/table/table.entity';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Mapper } from '@automapper/core';
import { InjectMapper } from '@automapper/nestjs';
import { DiscountType, OrderStatus, OrderType } from './order.constants';
import { TableStatus } from 'src/table/table.constant';
import { WorkflowStatus } from 'src/tracking/tracking.constants';
import { OrderException } from './order.exception';
import { OrderValidation } from './order.validation';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { Menu } from 'src/menu/menu.entity';
import moment from 'moment';
import * as _ from 'lodash';
import { OrderScheduler } from './order.scheduler';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { OrderUtils } from './order.utils';
import { BranchUtils } from 'src/branch/branch.utils';
import { TableUtils } from 'src/table/table.utils';
import { UserUtils } from 'src/user/user.utils';
import { MenuItemUtils } from 'src/menu-item/menu-item.utils';
import { VariantUtils } from 'src/variant/variant.utils';
import { MenuUtils } from 'src/menu/menu.utils';
import { VoucherUtils } from 'src/voucher/voucher.utils';
import { Voucher } from 'src/voucher/entity/voucher.entity';
import { OrderItemUtils } from 'src/order-item/order-item.utils';
import { Promotion } from 'src/promotion/promotion.entity';
import { PromotionUtils } from 'src/promotion/promotion.utils';
import { MenuItemValidation } from 'src/menu-item/menu-item.validation';
import { MenuItemException } from 'src/menu-item/menu-item.exception';
import { RoleEnum } from 'src/role/role.enum';
import { User } from 'src/user/user.entity';
import { PaymentUtils } from 'src/payment/payment.utils';
import {
  VoucherApplicabilityRule,
  VoucherType,
} from 'src/voucher/voucher.constant';
import { PrinterJob } from 'src/printer/entity/printer-job.entity';
import {
  PrinterJobStatus,
  PrinterJobType,
} from 'src/printer/printer.constants';
import { PrinterJobResponseDto } from 'src/printer/printer.dto';
import { PrinterProducer } from 'src/printer/printer.producer';
import { AccumulatedPointService } from 'src/accumulated-point/accumulated-point.service';
import { GoogleMapConnectorClient } from 'src/google-map/google-map-connector.client';
import { BranchException } from 'src/branch/branch.exception';
import { BranchValidation } from 'src/branch/branch.validation';
import { Address } from 'src/google-map/entities/address.entity';
import { BranchConfigService } from 'src/branch-config/branch-config.service';
import { BranchConfigKey } from 'src/branch-config/branch-config.constant';
import { FeatureFlagSystemService } from 'src/feature-flag-system/feature-flag-system.service';
import {
  FeatureFlagSystems,
  FeatureSystemGroups,
} from 'src/feature-flag-system/feature-flag-system.constant';
import { checkActiveUser, checkUserRequirement } from 'src/auth/auth.utils';
import { NotificationUtils } from 'src/notification/notification.utils';
import { ChefOrderUtils } from 'src/chef-order/chef-order.utils';
import { InvoiceService } from 'src/invoice/invoice.service';
import { WorkShift } from 'src/work-shift/work-shift.entity';
import { WorkShiftStatus } from 'src/work-shift/work-shift.constants';
@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectMapper() private readonly mapper: Mapper,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(PrinterJob)
    private readonly printerJobRepository: Repository<PrinterJob>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly orderScheduler: OrderScheduler,
    private readonly transactionManagerService: TransactionManagerService,
    private readonly orderUtils: OrderUtils,
    private readonly branchUtils: BranchUtils,
    private readonly tableUtils: TableUtils,
    private readonly userUtils: UserUtils,
    private readonly menuItemUtils: MenuItemUtils,
    private readonly variantUtils: VariantUtils,
    private readonly menuUtils: MenuUtils,
    private readonly voucherUtils: VoucherUtils,
    private readonly orderItemUtils: OrderItemUtils,
    private readonly promotionUtils: PromotionUtils,
    private readonly paymentUtils: PaymentUtils,
    private readonly accumulatedPointService: AccumulatedPointService,
    private readonly googleMapConnectorClient: GoogleMapConnectorClient,
    private readonly branchConfigService: BranchConfigService,
    private readonly featureFlagSystemService: FeatureFlagSystemService,
    private readonly notificationUtils: NotificationUtils,
    private readonly printerProducer: PrinterProducer,
    private readonly chefOrderUtils: ChefOrderUtils,
    private readonly invoiceService: InvoiceService,
    @InjectRepository(WorkShift)
    private readonly workShiftRepository: Repository<WorkShift>,
  ) {}

  async getMaxDistanceDelivery(branchSlug: string): Promise<number> {
    const maxDistanceDelivery = await this.branchConfigService.get(
      BranchConfigKey.MAX_DISTANCE_DELIVERY,
      branchSlug,
    );
    return Number(maxDistanceDelivery || 0);
  }

  async getDeliveryFeePerKm(branchSlug: string): Promise<number> {
    const deliveryFeePerKm = await this.branchConfigService.get(
      BranchConfigKey.DELIVERY_FEE_PER_KM,
      branchSlug,
    );
    return Number(deliveryFeePerKm || 0);
  }

  /**
   * Delete order
   * @param {string} slug
   * @returns {Promise<void>} The deleted order
   */
  async deleteOrder(
    slug: string,
    requesterId?: string,
    requesterRole?: string,
  ): Promise<Order> {
    if (requesterRole === RoleEnum.Customer) {
      const order = await this.orderRepository.findOne({
        where: { slug },
        relations: ['owner'],
      });
      if (!order) {
        throw new OrderException(OrderValidation.ORDER_NOT_FOUND);
      }
      if (order.owner?.id !== requesterId) {
        throw new OrderException(
          OrderValidation.NOT_PERMISSION_TO_DELETE_ORDER,
        );
      }
    }
    return await this.handleDeleteOrder(slug);
  }

  async deleteOrderPublic(slug: string, orders: string[]): Promise<Order> {
    const context = `${OrderService.name}.${this.deleteOrderPublic.name}`;
    if (!orders.includes(slug)) {
      this.logger.warn(`Order ${slug} is not in the list`, context);
      throw new OrderException(OrderValidation.ORDER_NOT_FOUND);
    }
    return await this.handleDeleteOrder(slug); // Delete order immediately
  }

  async handleDeleteOrder(orderSlug: string) {
    const context = `${OrderUtils.name}.${this.deleteOrder.name}`;
    this.logger.log(`Cancel order ${orderSlug}`, context);

    const order = await this.orderRepository.findOne({
      where: {
        slug: orderSlug,
      },
      relations: [
        'payment',
        'owner',
        'approvalBy',
        'orderItems.chefOrderItems',
        'orderItems.variant.size',
        'orderItems.variant.product',
        'orderItems.promotion',
        'orderItems.trackingOrderItems.tracking',
        'invoice.invoiceItems',
        'table',
        'voucher',
        'branch',
        'chefOrders.chefOrderItems',
      ],
    });

    if (!order) {
      this.logger.warn(`Order ${orderSlug} not found`, context);
      throw new OrderException(OrderValidation.ORDER_NOT_FOUND);
    }

    if (order.status !== OrderStatus.PENDING) {
      this.logger.warn(`Order ${orderSlug} is not pending`, context);
      throw new OrderException(OrderValidation.ORDER_IS_NOT_PENDING);
    }
    // Get all menu items base on unique products
    const orderDate = new Date(moment(order.createdAt).format('YYYY-MM-DD'));
    const menuItems = await this.menuItemUtils.getCurrentMenuItems(
      order,
      orderDate,
      'increment',
    );

    const { payment, table, voucher } = order;

    // Delete order
    const removedOrder = await this.transactionManagerService.execute<Order>(
      async (manager) => {
        // Cancel accumulated points reservation
        await this.accumulatedPointService.handleCancelReservation(
          order.id,
          null,
        );
        // Update subtotal and accumulated points to use in order
        const subtotalBeforeUseAccumulatedPoints =
          order.subtotal + order.accumulatedPointsToUse;
        order.accumulatedPointsToUse = 0;
        order.subtotal = subtotalBeforeUseAccumulatedPoints;
        await manager.save(order);

        // Update stock of menu items
        await manager.save(menuItems);
        this.logger.log(
          `Menu items: ${menuItems.map((item) => item.product.name).join(', ')} updated`,
          context,
        );

        // Remove order items
        if (order.orderItems) await manager.softRemove(order.orderItems);

        // Remove order
        const removedOrder = await manager.softRemove(order);

        // Remove payment
        if (payment) {
          // await manager.softRemove(payment);
          // this.logger.log(`Payment has been removed`, context);
          await this.paymentUtils.cancelPayment(payment.slug);
        }

        // Update table status if order is at table
        if (table) {
          table.status = 'available';
          await manager.save(table);
          this.logger.log(`Table ${table.name} is available`, context);
        }

        // Update voucher remaining quantity
        if (voucher) {
          voucher.remainingUsage += 1;
          await manager.save(voucher);
          this.logger.log(
            `Voucher ${voucher.code} remaining usage updated`,
            context,
          );
        }
        return removedOrder;
      },
      () => {
        this.logger.log(`Order ${orderSlug} has been canceled`, context);
      },
      (error) => {
        this.logger.error(
          `Error when cancel order ${orderSlug}: ${error.message}`,
          error.stack,
          context,
        );
        throw new OrderException(OrderValidation.ERROR_WHEN_CANCEL_ORDER);
      },
    );
    return removedOrder;
  }

  /**
   * Handles order updating
   * @param {string} slug
   * @param {UpdateOrderRequestDto} requestData The data to update order
   * @returns {Promise<OrderResponseDto>} The updated order
   * @throws {OrderException} If order is not found
   */
  async updateOrder(
    slug: string,
    requestData: UpdateOrderRequestDto,
    requestUserRole?: string | null,
  ): Promise<OrderResponseDto> {
    const context = `${OrderService.name}.${this.updateOrder.name}`;

    const order = await this.orderUtils.getOrder({ where: { slug } });

    if (order.status !== OrderStatus.PENDING) {
      this.logger.warn(`Order ${slug} is not pending`, context);
      throw new OrderException(OrderValidation.ORDER_IS_NOT_PENDING);
    }

    // check feature flag
    if (requestData.type === OrderType.AT_TABLE) {
      await this.featureFlagSystemService.validateFeatureFlag(
        FeatureSystemGroups.ORDER,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.key,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.children.AT_TABLE.key,
      );
    }
    if (requestData.type === OrderType.TAKE_OUT) {
      await this.featureFlagSystemService.validateFeatureFlag(
        FeatureSystemGroups.ORDER,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.key,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.children.TAKE_OUT.key,
      );
    }
    if (requestData.type === OrderType.DELIVERY) {
      await this.featureFlagSystemService.validateFeatureFlag(
        FeatureSystemGroups.ORDER,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.key,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.children.DELIVERY.key,
      );
    }

    // check permission
    if (order.owner?.phonenumber === 'default-customer') {
      // public user
      if (requestUserRole === RoleEnum.Customer) {
        this.logger.warn(`Not permission to update order`, context);
        throw new OrderException(
          OrderValidation.NOT_PERMISSION_TO_UPDATE_ORDER,
        );
      }

      if (requestData.type === OrderType.DELIVERY) {
        this.logger.warn(
          `Delivery type is not allowed for public order`,
          context,
        );
        throw new OrderException(OrderValidation.DELIVERY_TYPE_NOT_ALLOWED);
      }
    }

    order.type = requestData.type;

    if (requestData.type === OrderType.AT_TABLE) {
      const table = await this.tableUtils.getTable({
        where: {
          slug: requestData.table ?? IsNull(),
        },
      });
      order.table = table;
      order.timeLeftTakeOut = 0;
      order.deliveryTo = null;
      order.deliveryPhone = null;
      order.deliveryFee = 0;
      order.deliveryDistance = 0;
    } else if (requestData.type === OrderType.TAKE_OUT) {
      order.table = null;
      order.timeLeftTakeOut = requestData.timeLeftTakeOut;
      order.deliveryTo = null;
      order.deliveryPhone = null;
      order.deliveryFee = 0;
      order.deliveryDistance = 0;
    } else if (requestData.type === OrderType.DELIVERY) {
      if (!order?.branch?.addressDetail) {
        this.logger.warn(
          `Branch address detail not found when construct order`,
          context,
        );
        throw new BranchException(
          BranchValidation.BRANCH_ADDRESS_DETAIL_NOT_FOUND,
        );
      }
      if (!requestData.deliveryPhone) {
        this.logger.warn(
          `Delivery phone not found when construct order`,
          context,
        );
        throw new OrderException(OrderValidation.DELIVERY_PHONE_NOT_FOUND);
      }
      if (!requestData.deliveryTo) {
        this.logger.warn(
          `Delivery address not found when construct order`,
          context,
        );
        throw new OrderException(OrderValidation.DELIVERY_ADDRESS_NOT_FOUND);
      }
      const deliveryTo =
        await this.googleMapConnectorClient.getPlaceDetailsByPlaceId(
          requestData.deliveryTo,
        );

      const origin = `${order.branch.addressDetail.lat},${order.branch.addressDetail.lng}`;
      const destination = `${deliveryTo?.geometry?.location?.lat},${deliveryTo?.geometry?.location?.lng}`;
      const { distance: deliveryDistance } =
        await this.googleMapConnectorClient.getDistanceAndDuration(
          origin,
          destination,
        );

      const maxDistanceDelivery = await this.getMaxDistanceDelivery(
        order.branch.slug,
      );
      const deliveryFeePerKm = await this.getDeliveryFeePerKm(
        order.branch.slug,
      );

      if (deliveryDistance > maxDistanceDelivery) {
        this.logger.warn(
          `Delivery distance is greater than max distance delivery`,
          context,
        );
        throw new OrderException(
          OrderValidation.DELIVERY_DISTANCE_GREATER_THAN_MAX_DISTANCE_DELIVERY,
        );
      }

      if (order.deliveryTo) {
        order.deliveryTo.formattedAddress =
          deliveryTo?.formatted_address || 'N/A';
        order.deliveryTo.lat = deliveryTo?.geometry?.location?.lat || 0;
        order.deliveryTo.lng = deliveryTo?.geometry?.location?.lng || 0;
        order.deliveryTo.placeId = requestData.deliveryTo;
        order.deliveryTo.url = deliveryTo?.url || 'N/A';
      } else {
        order.deliveryTo = new Address();
        order.deliveryTo.formattedAddress =
          deliveryTo?.formatted_address || 'N/A';
        order.deliveryTo.lat = deliveryTo?.geometry?.location?.lat || 0;
        order.deliveryTo.lng = deliveryTo?.geometry?.location?.lng || 0;
        order.deliveryTo.placeId = requestData.deliveryTo;
        order.deliveryTo.url = deliveryTo?.url || 'N/A';
      }

      order.deliveryPhone = requestData.deliveryPhone;
      order.deliveryFee = deliveryDistance * deliveryFeePerKm;
      order.deliveryDistance = deliveryDistance;
      order.timeLeftTakeOut = 0;
      order.table = null;
    }

    if (requestData.description) {
      order.description = requestData.description;
    }

    // update subtotal after update delivery fee
    const { subtotal, totalVatValue } = await this.orderUtils.getOrderSubtotal(
      order,
      order.voucher,
    );
    order.subtotal = subtotal;
    order.totalVatValue = totalVatValue;

    // Update order
    const updatedOrder = await this.transactionManagerService.execute<Order>(
      async (manager) => {
        return await manager.save(order);
      },
      (result) => {
        this.logger.log(
          `Order with slug ${result.slug} updated successfully`,
          context,
        );
      },
      (error) => {
        this.logger.warn(
          `Error when updating order: ${error.message}`,
          context,
        );
        throw new OrderException(
          OrderValidation.UPDATE_ORDER_ERROR,
          error.message,
        );
      },
    );

    return this.mapper.map(updatedOrder, Order, OrderResponseDto);
  }

  async updateVoucherOrder(
    slug: string,
    requestData: UpdateVoucherOrderRequestDto,
  ): Promise<OrderResponseDto> {
    const context = `${OrderService.name}.${this.updateVoucherOrder.name}`;

    const order = await this.orderUtils.getOrder({ where: { slug } });

    if (order.status !== OrderStatus.PENDING) {
      this.logger.warn(`Order ${slug} is not pending`, context);
      throw new OrderException(OrderValidation.ORDER_IS_NOT_PENDING);
    }

    const hasCustomPrice = order.orderItems.some(
      (item) =>
        item.customPrice != null && item.variant?.product?.isCustomPrice,
    );
    if (hasCustomPrice && requestData.voucher) {
      this.logger.warn(
        `Cannot apply voucher to order ${slug} with custom price items`,
        context,
      );
      throw new OrderException(
        OrderValidation.CUSTOM_PRICE_PRODUCT_NOT_ALLOWED,
      );
    }

    // Get new voucher
    let voucher: Voucher = null;

    // Remove voucher from order
    const previousVoucher = order.voucher;

    // update order item => remove voucher value
    if (
      previousVoucher?.applicabilityRule ===
      VoucherApplicabilityRule.ALL_REQUIRED
    ) {
      if (
        previousVoucher?.type === VoucherType.SAME_PRICE_PRODUCT ||
        previousVoucher?.type === VoucherType.PERCENT_ORDER
      ) {
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

    if (
      previousVoucher?.applicabilityRule ===
      VoucherApplicabilityRule.AT_LEAST_ONE_REQUIRED
    ) {
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

    order.voucher = null;
    const { subtotal, originalSubtotal, totalVatValue } =
      await this.orderUtils.getOrderSubtotal(order, null);

    order.subtotal = subtotal;
    order.originalSubtotal = originalSubtotal;
    order.totalVatValue = totalVatValue;

    // Validate new voucher
    if (requestData.voucher) {
      voucher = await this.voucherUtils.getVoucher({
        where: {
          slug: requestData.voucher ?? IsNull(),
        },
        relations: {
          voucherProducts: {
            product: true,
          },
          voucherUserGroups: { userGroup: true },
          assignedUser: true,
        },
      });

      if (previousVoucher?.id === voucher.id) {
        this.logger.warn(
          `Voucher ${voucher.code} is the same as the previous voucher`,
          context,
        );
        throw new OrderException(
          OrderValidation.VOUCHER_IS_THE_SAME_PREVIOUS_VOUCHER,
        );
      }

      // await this.voucherUtils.validateVoucher(voucher);
      await this.voucherUtils.validateVoucherTime(voucher);
      this.voucherUtils.validateVoucherRemainingUsage(voucher);
      await this.voucherUtils.validateVoucherUsage(voucher, order.owner.slug);
      await this.voucherUtils.validateMinOrderValue(voucher, order);

      await this.voucherUtils.validateVoucherProduct(
        voucher,
        order.orderItems.map((item) => item.variant.slug),
      );

      // Validate limit items of voucher, by pass gift product
      this.voucherUtils.validateLimitItems(voucher, order.orderItems);
    }

    // Update order
    const updatedOrder = await this.transactionManagerService.execute<Order>(
      async (manager) => {
        if (order.payment) {
          await this.paymentUtils.cancelPayment(order.payment.slug);
        }

        if (voucher) {
          const lockedVoucher = await manager.findOne(Voucher, {
            where: { id: voucher.id },
            lock: { mode: 'pessimistic_write' },
          });
          this.voucherUtils.validateVoucherRemainingUsage(lockedVoucher);
          lockedVoucher.remainingUsage -= 1;

          // Update order
          order.voucher = voucher;

          // update order item => add voucher value
          if (
            voucher.applicabilityRule === VoucherApplicabilityRule.ALL_REQUIRED
          ) {
            if (
              voucher.type === VoucherType.SAME_PRICE_PRODUCT ||
              voucher.type === VoucherType.PERCENT_ORDER
            ) {
              const updatedOrderItems = order.orderItems.map((orderItem) => {
                const updatedOrderItem =
                  this.orderItemUtils.getUpdatedOrderItem(
                    voucher,
                    orderItem,
                    true, // is add voucher
                  );
                return updatedOrderItem;
              });
              order.orderItems = updatedOrderItems;
            } else {
              // FIXED_VALUE: applied at order level in getOrderSubtotal, reset per-item
              const updatedOrderItems = order.orderItems.map((orderItem) => {
                const updatedOrderItem =
                  this.orderItemUtils.getUpdatedOrderItem(
                    null,
                    orderItem,
                    false, // is add voucher
                  );
                return updatedOrderItem;
              });
              order.orderItems = updatedOrderItems;
            }
          }

          if (
            voucher.applicabilityRule ===
            VoucherApplicabilityRule.AT_LEAST_ONE_REQUIRED
          ) {
            const updatedOrderItems = order.orderItems.map((orderItem) => {
              const updatedOrderItem = this.orderItemUtils.getUpdatedOrderItem(
                voucher,
                orderItem,
                true, // is add voucher
              );
              return updatedOrderItem;
            });
            order.orderItems = updatedOrderItems;
          }

          const { subtotal, totalVatValue } =
            await this.orderUtils.getOrderSubtotal(order, voucher);
          order.subtotal = subtotal;
          order.totalVatValue = totalVatValue;

          await manager.save(lockedVoucher);
        }

        if (previousVoucher) {
          previousVoucher.remainingUsage += 1;
          await manager.save(previousVoucher);
        }

        // Cancel accumulated points reservation
        await this.accumulatedPointService.handleCancelReservation(
          order.id,
          null,
        );
        // Update accumulated points to use in order
        order.accumulatedPointsToUse = 0;

        return await manager.save(order);
      },
      (result) => {
        this.logger.log(
          `Order with slug ${result.slug} updated successfully`,
          context,
        );
      },
      (error) => {
        this.logger.warn(
          `Error when updating order: ${error.message}`,
          context,
        );
        throw new OrderException(
          OrderValidation.UPDATE_ORDER_ERROR,
          error.message,
        );
      },
    );

    return this.mapper.map(updatedOrder, Order, OrderResponseDto);
  }

  async updateOwnerOrder(
    slug: string,
    requestData: UpdateOwnerOrderRequestDto,
  ): Promise<OrderResponseDto> {
    const context = `${OrderService.name}.${this.updateOwnerOrder.name}`;

    const order = await this.orderUtils.getOrder({ where: { slug } });

    if (order.status !== OrderStatus.PENDING) {
      this.logger.warn(`Order ${slug} is not pending`, context);
      throw new OrderException(OrderValidation.ORDER_IS_NOT_PENDING);
    }

    const defaultCustomer = await this.userUtils.getUser({
      where: {
        phonenumber: 'default-customer',
        role: { name: RoleEnum.Customer },
      },
      relations: { userRequirements: true },
    });

    let owner = await this.userRepository.findOne({
      where: { slug: requestData.owner ?? IsNull() },
      relations: { userRequirements: true },
    });
    if (!owner) owner = defaultCustomer;

    checkActiveUser(owner);
    checkUserRequirement(owner);

    const previousVoucher = order.voucher;
    if (previousVoucher) {
      if (
        previousVoucher.applicabilityRule ===
        VoucherApplicabilityRule.ALL_REQUIRED
      ) {
        if (
          previousVoucher.type === VoucherType.SAME_PRICE_PRODUCT ||
          previousVoucher.type === VoucherType.PERCENT_ORDER
        ) {
          order.orderItems = order.orderItems.map((orderItem) =>
            this.orderItemUtils.getUpdatedOrderItem(null, orderItem, false),
          );
        }
      }

      if (
        previousVoucher.applicabilityRule ===
        VoucherApplicabilityRule.AT_LEAST_ONE_REQUIRED
      ) {
        order.orderItems = order.orderItems.map((orderItem) =>
          this.orderItemUtils.getUpdatedOrderItem(null, orderItem, false),
        );
      }

      order.voucher = null;
      const { subtotal, originalSubtotal, totalVatValue } =
        await this.orderUtils.getOrderSubtotal(order, null);
      order.subtotal = subtotal;
      order.originalSubtotal = originalSubtotal;
      order.totalVatValue = totalVatValue;
    }

    order.owner = owner;

    const updatedOrder = await this.transactionManagerService.execute<Order>(
      async (manager) => {
        if (previousVoucher) {
          previousVoucher.remainingUsage += 1;
          await manager.save(previousVoucher);
        }
        return await manager.save(order);
      },
      (result) => {
        this.logger.log(
          `Order ${result.slug} owner updated successfully`,
          context,
        );
      },
      (error) => {
        this.logger.warn(
          `Error when updating order owner: ${error.message}`,
          context,
        );
        throw new OrderException(
          OrderValidation.CHANGE_OWNER_ERROR,
          error.message,
        );
      },
    );

    return this.mapper.map(updatedOrder, Order, OrderResponseDto);
  }

  async updateVoucherOrderPublic(
    slug: string,
    orders: string[],
    requestData: UpdateVoucherOrderRequestDto,
  ): Promise<OrderResponseDto> {
    const context = `${OrderService.name}.${this.updateVoucherOrderPublic.name}`;

    if (!orders.includes(slug)) {
      this.logger.warn(`Order ${slug} is not in the list`, context);
      throw new OrderException(OrderValidation.ORDER_NOT_FOUND);
    }

    const order = await this.orderUtils.getOrder({ where: { slug } });

    if (order.status !== OrderStatus.PENDING) {
      this.logger.warn(`Order ${slug} is not pending`, context);
      throw new OrderException(OrderValidation.ORDER_IS_NOT_PENDING);
    }

    const hasCustomPrice = order.orderItems.some(
      (item) =>
        item.customPrice != null && item.variant?.product?.isCustomPrice,
    );
    if (hasCustomPrice && requestData.voucher) {
      this.logger.warn(
        `Cannot apply voucher to order ${slug} with custom price items`,
        context,
      );
      throw new OrderException(
        OrderValidation.CUSTOM_PRICE_PRODUCT_NOT_ALLOWED,
      );
    }

    // Get new voucher
    let voucher: Voucher = null;

    // Remove voucher from order
    const previousVoucher = order.voucher;

    // update order item => remove voucher value
    if (
      previousVoucher?.applicabilityRule ===
      VoucherApplicabilityRule.ALL_REQUIRED
    ) {
      if (
        previousVoucher?.type === VoucherType.SAME_PRICE_PRODUCT ||
        previousVoucher?.type === VoucherType.PERCENT_ORDER
      ) {
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

    if (
      previousVoucher?.applicabilityRule ===
      VoucherApplicabilityRule.AT_LEAST_ONE_REQUIRED
    ) {
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

    order.voucher = null;
    const { subtotal, originalSubtotal, totalVatValue } =
      await this.orderUtils.getOrderSubtotal(order, null);

    order.subtotal = subtotal;
    order.originalSubtotal = originalSubtotal;
    order.totalVatValue = totalVatValue;

    // Validate new voucher
    if (requestData.voucher) {
      voucher = await this.voucherUtils.getVoucher({
        where: {
          slug: requestData.voucher ?? IsNull(),
        },
        relations: {
          voucherProducts: {
            product: true,
          },
          voucherUserGroups: { userGroup: true },
          assignedUser: true,
        },
      });

      if (previousVoucher?.id === voucher.id) {
        this.logger.warn(
          `Voucher ${voucher.code} is the same as the previous voucher`,
          context,
        );
        throw new OrderException(
          OrderValidation.VOUCHER_IS_THE_SAME_PREVIOUS_VOUCHER,
        );
      }

      // await this.voucherUtils.validateVoucher(voucher);
      await this.voucherUtils.validateVoucherTime(voucher);
      this.voucherUtils.validateVoucherRemainingUsage(voucher);
      await this.voucherUtils.validateVoucherUsage(voucher);
      await this.voucherUtils.validateMinOrderValue(voucher, order);

      await this.voucherUtils.validateVoucherProduct(
        voucher,
        order.orderItems.map((item) => item.variant.slug),
      );

      // Validate limit items of voucher, by pass gift product
      this.voucherUtils.validateLimitItems(voucher, order.orderItems);
    }

    // Update order
    const updatedOrder = await this.transactionManagerService.execute<Order>(
      async (manager) => {
        if (order.payment) {
          await this.paymentUtils.cancelPayment(order.payment.slug);
        }

        if (voucher) {
          const lockedVoucher = await manager.findOne(Voucher, {
            where: { id: voucher.id },
            lock: { mode: 'pessimistic_write' },
          });
          this.voucherUtils.validateVoucherRemainingUsage(lockedVoucher);
          lockedVoucher.remainingUsage -= 1;

          // Update order
          order.voucher = voucher;

          // update order item => add voucher value
          if (
            voucher.applicabilityRule === VoucherApplicabilityRule.ALL_REQUIRED
          ) {
            if (
              voucher.type === VoucherType.SAME_PRICE_PRODUCT ||
              voucher.type === VoucherType.PERCENT_ORDER
            ) {
              const updatedOrderItems = order.orderItems.map((orderItem) => {
                const updatedOrderItem =
                  this.orderItemUtils.getUpdatedOrderItem(
                    voucher,
                    orderItem,
                    true, // is add voucher
                  );
                return updatedOrderItem;
              });
              order.orderItems = updatedOrderItems;
            } else {
              // FIXED_VALUE: applied at order level in getOrderSubtotal, reset per-item
              const updatedOrderItems = order.orderItems.map((orderItem) => {
                const updatedOrderItem =
                  this.orderItemUtils.getUpdatedOrderItem(
                    null,
                    orderItem,
                    false, // is add voucher
                  );
                return updatedOrderItem;
              });
              order.orderItems = updatedOrderItems;
            }
          }

          if (
            voucher.applicabilityRule ===
            VoucherApplicabilityRule.AT_LEAST_ONE_REQUIRED
          ) {
            const updatedOrderItems = order.orderItems.map((orderItem) => {
              const updatedOrderItem = this.orderItemUtils.getUpdatedOrderItem(
                voucher,
                orderItem,
                true, // is add voucher
              );
              return updatedOrderItem;
            });
            order.orderItems = updatedOrderItems;
          }

          const { subtotal, totalVatValue } =
            await this.orderUtils.getOrderSubtotal(order, voucher);
          order.subtotal = subtotal;
          order.totalVatValue = totalVatValue;

          await manager.save(lockedVoucher);
        }

        if (previousVoucher) {
          previousVoucher.remainingUsage += 1;
          await manager.save(previousVoucher);
        }

        return await manager.save(order);
      },
      (result) => {
        this.logger.log(
          `Order with slug ${result.slug} updated successfully`,
          context,
        );
      },
      (error) => {
        this.logger.warn(
          `Error when updating order: ${error.message}`,
          context,
        );
        throw new OrderException(
          OrderValidation.UPDATE_ORDER_ERROR,
          error.message,
        );
      },
    );

    return this.mapper.map(updatedOrder, Order, OrderResponseDto);
  }

  /**
   * Handles order creation
   * This method creates new order and order items
   * @param {CreateOrderRequestDto} requestData The data to create a new order
   * @returns {Promise<OrderResponseDto>} The created order
   * @throws {BranchException} If branch is not found
   * @throws {TableException} If table is not found in this branch
   * @throws {OrderException} If invalid data to create order item
   */
  async createOrder(
    requestData: CreateOrderRequestDto,
    requestUserRole?: string | null,
  ): Promise<OrderResponseDto> {
    const context = `${OrderService.name}.${this.createOrder.name}`;

    // Check feature flag
    if (requestData.type === OrderType.AT_TABLE) {
      await this.featureFlagSystemService.validateFeatureFlag(
        FeatureSystemGroups.ORDER,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.key,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.children.AT_TABLE.key,
      );
    }
    if (requestData.type === OrderType.TAKE_OUT) {
      await this.featureFlagSystemService.validateFeatureFlag(
        FeatureSystemGroups.ORDER,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.key,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.children.TAKE_OUT.key,
      );
    }
    if (requestData.type === OrderType.DELIVERY) {
      await this.featureFlagSystemService.validateFeatureFlag(
        FeatureSystemGroups.ORDER,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.key,
        FeatureFlagSystems.ORDER.CREATE_PRIVATE.children.DELIVERY.key,
      );
    }

    // Get voucher
    let voucher: Voucher = null;
    try {
      voucher = await this.voucherUtils.getVoucher({
        where: {
          slug: requestData.voucher ?? IsNull(),
        },
        relations: {
          voucherProducts: {
            product: true,
          },
          voucherUserGroups: { userGroup: true },
          assignedUser: true,
        },
      });
    } catch (error) {
      this.logger.warn(`${error.message}`, context);
    }

    if (voucher) {
      // await this.voucherUtils.validateVoucher(voucher);
      await this.voucherUtils.validateVoucherTime(voucher);
      this.voucherUtils.validateVoucherRemainingUsage(voucher);
      await this.voucherUtils.validateVoucherUsage(voucher, requestData.owner);
      await this.voucherUtils.validateVoucherProduct(
        voucher,
        requestData.orderItems.map((item) => item.variant) || [],
      );
    }

    // Construct order
    const order: Order = await this.constructOrder(requestData);

    // Get order items
    const orderItems = await this.constructOrderItems(
      requestData.branch,
      requestData.orderItems,
      voucher,
      requestUserRole,
    );

    this.logger.log(`Number of order items: ${orderItems.length}`, context);

    if (voucher) {
      // Validate limit items of voucher, by pass gift product
      this.voucherUtils.validateLimitItems(voucher, orderItems);
    }

    order.orderItems = orderItems;

    if (voucher) {
      await this.voucherUtils.validateMinOrderValue(voucher, order);
    }

    order.voucher = voucher;

    const { subtotal, totalVatValue } = await this.orderUtils.getOrderSubtotal(
      order,
      voucher,
    );
    order.subtotal = subtotal;
    order.totalVatValue = totalVatValue;

    order.originalSubtotal = order.orderItems.reduce(
      (previous, current) => previous + current.originalSubtotal,
      0,
    );

    const createdOrder = await this.transactionManagerService.execute<Order>(
      async (manager) => {
        const createdOrder = await manager.save(order);
        const date = new Date(moment().format('YYYY-MM-DD'));
        const uniqueProductMap = new Map<
          string,
          { orderItem: OrderItem; totalQty: number }
        >();
        for (const orderItem of createdOrder.orderItems) {
          const productId = orderItem.variant.product.id;
          orderItem.order = createdOrder;
          if (uniqueProductMap.has(productId)) {
            uniqueProductMap.get(productId).totalQty += orderItem.quantity;
          } else {
            uniqueProductMap.set(productId, {
              orderItem,
              totalQty: orderItem.quantity,
            });
          }
        }
        for (const { orderItem, totalQty } of uniqueProductMap.values()) {
          await this.menuItemUtils.getCurrentMenuItem(
            orderItem,
            date,
            'decrement',
            totalQty,
            manager,
          );
        }

        if (voucher) {
          const lockedVoucher = await manager.findOne(Voucher, {
            where: { id: voucher.id },
            lock: { mode: 'pessimistic_write' },
          });
          this.voucherUtils.validateVoucherRemainingUsage(lockedVoucher);
          lockedVoucher.remainingUsage -= 1;
          await manager.save(lockedVoucher);
        }

        this.logger.log(
          `Menu items and voucher updated atomically for order ${createdOrder.slug}`,
          context,
        );

        // Cancel order after 15 minutes (skip for AT_TABLE — staff-managed orders stay open)
        if (createdOrder.type !== OrderType.AT_TABLE) {
          this.orderScheduler.handleDeleteOrder(
            createdOrder.slug,
            15 * 60 * 1000,
          );
        }
        return createdOrder;
      },
      (result) => {
        this.logger.log(`Order ${result.slug} has been created`, context);
      },
      (error) => {
        this.logger.warn(
          `Error when creating new order: ${error.message}`,
          context,
        );
        throw new OrderException(OrderValidation.CREATE_ORDER_ERROR);
      },
    );

    // Auto-create chef order immediately for AT_TABLE orders
    if (createdOrder.type === OrderType.AT_TABLE) {
      await this.chefOrderUtils.createChefOrder(createdOrder.id, false);
    }

    return this.mapper.map(createdOrder, Order, OrderResponseDto);
  }

  /**
   * Handles order creation for public
   * This method creates new order and order items
   * @param {CreateOrderRequestDto} requestData The data to create a new order
   * @returns {Promise<OrderResponseDto>} The created order
   * @throws {BranchException} If branch is not found
   * @throws {TableException} If table is not found in this branch
   * @throws {OrderException} If invalid data to create order item
   */
  async createOrderPublic(
    requestData: CreateOrderRequestDto,
    requestUserRole?: string | null,
  ): Promise<OrderResponseDto> {
    const context = `${OrderService.name}.${this.createOrder.name}`;

    // Check feature flag
    if (requestData.type === OrderType.AT_TABLE) {
      await this.featureFlagSystemService.validateFeatureFlag(
        FeatureSystemGroups.ORDER,
        FeatureFlagSystems.ORDER.CREATE_PUBLIC.key,
        FeatureFlagSystems.ORDER.CREATE_PUBLIC.children.AT_TABLE.key,
      );
    }
    if (requestData.type === OrderType.TAKE_OUT) {
      await this.featureFlagSystemService.validateFeatureFlag(
        FeatureSystemGroups.ORDER,
        FeatureFlagSystems.ORDER.CREATE_PUBLIC.key,
        FeatureFlagSystems.ORDER.CREATE_PUBLIC.children.TAKE_OUT.key,
      );
    }

    if (requestData.type === OrderType.DELIVERY) {
      this.logger.warn(
        `Delivery type is not allowed for public order`,
        context,
      );
      throw new OrderException(OrderValidation.DELIVERY_TYPE_NOT_ALLOWED);
    }

    // Get voucher
    let voucher: Voucher = null;
    try {
      voucher = await this.voucherUtils.getVoucher({
        where: {
          slug: requestData.voucher ?? IsNull(),
        },
        relations: {
          voucherProducts: {
            product: true,
          },
          voucherUserGroups: { userGroup: true },
          assignedUser: true,
        },
      });
    } catch (error) {
      this.logger.warn(`${error.message}`, context);
    }

    if (voucher) {
      // await this.voucherUtils.validateVoucher(voucher);
      await this.voucherUtils.validateVoucherTime(voucher);
      this.voucherUtils.validateVoucherRemainingUsage(voucher);
      await this.voucherUtils.validateVoucherUsage(voucher, requestData.owner);
      await this.voucherUtils.validateVoucherProduct(
        voucher,
        requestData.orderItems.map((item) => item.variant) || [],
      );
    }

    // Construct order
    const order: Order = await this.constructOrder(requestData);

    // Get order items
    const orderItems = await this.constructOrderItems(
      requestData.branch,
      requestData.orderItems,
      voucher,
      requestUserRole,
    );
    this.logger.log(`Number of order items: ${orderItems.length}`, context);
    order.orderItems = orderItems;

    if (voucher) {
      await this.voucherUtils.validateMinOrderValue(voucher, order);
    }

    order.voucher = voucher;

    const { subtotal, totalVatValue } = await this.orderUtils.getOrderSubtotal(
      order,
      voucher,
    );
    order.subtotal = subtotal;
    order.totalVatValue = totalVatValue;

    order.originalSubtotal = order.orderItems.reduce(
      (previous, current) => previous + current.originalSubtotal,
      0,
    );

    const createdOrder = await this.transactionManagerService.execute<Order>(
      async (manager) => {
        const createdOrder = await manager.save(order);
        const date = new Date(moment().format('YYYY-MM-DD'));
        const uniqueProductMap = new Map<
          string,
          { orderItem: OrderItem; totalQty: number }
        >();
        for (const orderItem of createdOrder.orderItems) {
          const productId = orderItem.variant.product.id;
          orderItem.order = createdOrder;
          if (uniqueProductMap.has(productId)) {
            uniqueProductMap.get(productId).totalQty += orderItem.quantity;
          } else {
            uniqueProductMap.set(productId, {
              orderItem,
              totalQty: orderItem.quantity,
            });
          }
        }
        for (const { orderItem, totalQty } of uniqueProductMap.values()) {
          await this.menuItemUtils.getCurrentMenuItem(
            orderItem,
            date,
            'decrement',
            totalQty,
            manager,
          );
        }

        if (voucher) {
          const lockedVoucher = await manager.findOne(Voucher, {
            where: { id: voucher.id },
            lock: { mode: 'pessimistic_write' },
          });
          this.voucherUtils.validateVoucherRemainingUsage(lockedVoucher);
          lockedVoucher.remainingUsage -= 1;
          await manager.save(lockedVoucher);
        }

        this.logger.log(
          `Menu items and voucher updated atomically for order ${createdOrder.slug}`,
          context,
        );

        // Cancel order after 10 minutes
        this.orderScheduler.handleDeleteOrder(
          createdOrder.slug,
          15 * 60 * 1000,
        );
        return createdOrder;
      },
      (result) => {
        this.logger.log(`Order ${result.slug} has been created`, context);
      },
      (error) => {
        this.logger.warn(
          `Error when creating new order: ${error.message}`,
          context,
        );
        throw new OrderException(OrderValidation.CREATE_ORDER_ERROR);
      },
    );

    return this.mapper.map(createdOrder, Order, OrderResponseDto);
  }

  /**
   *
   * @param {CreateOrderRequestDto} data The data to create order
   * @returns {Promise<Order>} The result of checking
   */
  async constructOrder(data: CreateOrderRequestDto): Promise<Order> {
    const context = `${OrderService.name}.${this.constructOrder.name}`;
    // Get branch
    const branch = await this.branchUtils.getBranch({
      where: { slug: data.branch },
      relations: ['addressDetail'],
    });

    // Get table if order type is at table
    let table: Table = null;
    let address: Address = null;
    let deliveryFee = 0;
    const deliveryDistance = 0;
    if (data.type === OrderType.AT_TABLE) {
      table = await this.tableUtils.getTable({
        where: {
          slug: data.table,
          branch: {
            id: branch.id,
          },
        },
      });

      const activeOrder = await this.orderUtils.getActiveOrderByTable(
        data.table,
      );
      if (activeOrder) {
        this.logger.warn(
          `Table ${data.table} already has pending order ${activeOrder.slug}`,
          context,
        );
        throw new OrderException(OrderValidation.TABLE_HAS_PENDING_ORDER);
      }

      data.timeLeftTakeOut = 0;
    } else if (data.type === OrderType.TAKE_OUT) {
      data.timeLeftTakeOut = data.timeLeftTakeOut || 0;
    } else if (data.type === OrderType.DELIVERY) {
      if (!branch.addressDetail) {
        this.logger.warn(
          `Branch address detail not found when construct order`,
          context,
        );
        throw new BranchException(
          BranchValidation.BRANCH_ADDRESS_DETAIL_NOT_FOUND,
        );
      }
      if (!data.deliveryPhone) {
        this.logger.warn(
          `Delivery phone not found when construct order`,
          context,
        );
        throw new OrderException(OrderValidation.DELIVERY_PHONE_NOT_FOUND);
      }
      if (!data.deliveryTo) {
        this.logger.warn(
          `Delivery address not found when construct order`,
          context,
        );
        throw new OrderException(OrderValidation.DELIVERY_ADDRESS_NOT_FOUND);
      }
      const deliveryTo =
        await this.googleMapConnectorClient.getPlaceDetailsByPlaceId(
          data.deliveryTo,
        );

      const origin = `${branch.addressDetail.lat},${branch.addressDetail.lng}`;
      const destination = `${deliveryTo?.geometry?.location?.lat},${deliveryTo?.geometry?.location?.lng}`;
      const { distance: deliveryDistance } =
        await this.googleMapConnectorClient.getDistanceAndDuration(
          origin,
          destination,
        );

      const maxDistanceDelivery = await this.getMaxDistanceDelivery(
        branch.slug,
      );
      const deliveryFeePerKm = await this.getDeliveryFeePerKm(branch.slug);

      if (deliveryDistance > maxDistanceDelivery) {
        this.logger.warn(
          `Delivery distance is greater than max distance delivery`,
          context,
        );
        throw new OrderException(
          OrderValidation.DELIVERY_DISTANCE_GREATER_THAN_MAX_DISTANCE_DELIVERY,
        );
      }

      // address
      address = new Address();
      address.formattedAddress = deliveryTo?.formatted_address || 'N/A';
      address.lat = deliveryTo?.geometry?.location?.lat || 0;
      address.lng = deliveryTo?.geometry?.location?.lng || 0;
      address.placeId = data.deliveryTo;
      address.url = deliveryTo?.url || 'N/A';

      // order
      deliveryFee = deliveryDistance * deliveryFeePerKm;
    }

    const defaultCustomer = await this.userUtils.getUser({
      where: {
        phonenumber: 'default-customer',
        role: {
          name: RoleEnum.Customer,
        },
      },
      relations: {
        userRequirements: true,
      },
    });

    // Get owner
    // let owner = await this.userUtils.getUser({
    //   where: { slug: data.owner ?? IsNull() },
    // });
    let owner = await this.userRepository.findOne({
      where: { slug: data.owner ?? IsNull() },
      relations: {
        userRequirements: true,
      },
    });
    if (!owner) owner = defaultCustomer;

    checkActiveUser(owner);
    checkUserRequirement(owner);

    // Get cashier
    // let approvalBy = await this.userRepository.findOne({
    //   where: { slug: data.approvalBy ?? IsNull() },
    // });
    // if (!approvalBy) approvalBy = defaultCustomer;
    const activeWorkShift = await this.workShiftRepository.findOne({
      where: { branch: { id: branch.id }, status: WorkShiftStatus.ACTIVE },
    });

    const order = this.mapper.map(data, CreateOrderRequestDto, Order);
    Object.assign(order, {
      owner,
      branch,
      table,
      deliveryTo: address,
      deliveryFee,
      deliveryDistance,
      workShift: activeWorkShift ?? null,
    });
    return order;
  }

  /**
   *
   * @param {CreateOrderItemRequestDto} createOrderItemRequestDtos The array of data to create order item
   * @returns {Promise<ConstructOrderItemResponseDto>} The result of checking
   */
  async constructOrderItems(
    branch: string,
    createOrderItemRequestDtos: CreateOrderItemRequestDto[],
    voucher?: Voucher,
    requestUserRole?: string | null,
  ): Promise<OrderItem[]> {
    const context = `${OrderService.name}.${this.constructOrderItems.name}`;

    // Get menu
    const menu = await this.menuUtils.getMenu({
      where: {
        branch: {
          slug: branch,
        },
        date: new Date(moment().format('YYYY-MM-DD')),
      },
    });

    const orderItems = await Promise.all(
      createOrderItemRequestDtos.map(
        async (item) =>
          await this.constructOrderItem(item, menu, voucher, requestUserRole),
      ),
    );

    const hasCustomPrice = orderItems.some(
      (item) =>
        item.customPrice != null && item.variant?.product?.isCustomPrice,
    );
    const hasNormal = orderItems.some(
      (item) =>
        !(item.customPrice != null && item.variant?.product?.isCustomPrice),
    );
    if (hasCustomPrice && hasNormal) {
      this.logger.warn(
        'Cannot mix custom price and normal products in the same order',
        context,
      );
      throw new OrderException(
        OrderValidation.CANNOT_MIX_CUSTOM_PRICE_AND_NORMAL_PRODUCT,
      );
    }

    if (hasCustomPrice) {
      if (orderItems.length > 1) {
        this.logger.warn(
          'Custom price order must contain exactly one item',
          context,
        );
        throw new OrderException(
          OrderValidation.CUSTOM_PRICE_ORDER_QUANTITY_MUST_BE_ONE,
        );
      }
      if (orderItems[0].quantity !== 1) {
        this.logger.warn(
          'Custom price product must have quantity of one',
          context,
        );
        throw new OrderException(
          OrderValidation.CUSTOM_PRICE_ORDER_QUANTITY_MUST_BE_ONE,
        );
      }
    }

    return orderItems;
  }

  async constructOrderItem(
    item: CreateOrderItemRequestDto,
    menu: Menu,
    voucher?: Voucher,
    requestUserRole?: string | null,
  ): Promise<OrderItem> {
    const context = `${OrderService.name}.${this.constructOrderItem.name}`;
    // Get variant
    const variant = await this.variantUtils.getVariant({
      where: {
        slug: item.variant,
      },
    });

    // validate gift product
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

    // Get menu item
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
    //  limit product
    if (item.quantity === Infinity) {
      this.logger.warn(
        OrderValidation.REQUEST_QUANTITY_MUST_OTHER_INFINITY.message,
        context,
      );
      throw new OrderException(
        OrderValidation.REQUEST_QUANTITY_MUST_OTHER_INFINITY,
      );
    }
    if (menuItem.defaultStock !== null) {
      if (item.quantity > menuItem.currentStock) {
        this.logger.warn(
          OrderValidation.REQUEST_QUANTITY_EXCESS_CURRENT_QUANTITY.message,
          context,
        );
        throw new OrderException(
          OrderValidation.REQUEST_QUANTITY_EXCESS_CURRENT_QUANTITY,
        );
      }
    }

    const promotion: Promotion = menuItem.promotion;
    await this.promotionUtils.validatePromotionWithMenuItem(
      item.promotion,
      menuItem,
    );

    const orderItem = this.mapper.map(
      item,
      CreateOrderItemRequestDto,
      OrderItem,
    );

    Object.assign(orderItem, {
      variant,
      promotion,
    });

    // Check item is applied to voucher or not
    let appliedVoucher: Voucher = null;
    const voucherProduct = voucher?.voucherProducts.find(
      (voucherProduct) => voucherProduct.product.id === variant.product.id,
    );
    if (voucherProduct) {
      appliedVoucher = voucher;
    }

    if (variant.product?.isCustomPrice) {
      if (item.customPrice == null) {
        this.logger.warn(
          `Custom price is required for product ${variant.product.slug}`,
          context,
        );
        throw new OrderException(OrderValidation.CUSTOM_PRICE_IS_REQUIRED);
      }
      if (item.customPrice <= 0) {
        this.logger.warn(
          `Custom price must be greater than zero for product ${variant.product.slug}`,
          context,
        );
        throw new OrderException(
          OrderValidation.CUSTOM_PRICE_MUST_BE_GREATER_THAN_ZERO,
        );
      }
      orderItem.customPrice = item.customPrice;
    }

    const { subtotal, voucherValue, vatRate, vatValue, isPromotionApplied } =
      this.orderItemUtils.calculateSubTotal(
        orderItem,
        promotion,
        appliedVoucher,
      );
    const unitPrice =
      variant.product?.isCustomPrice && orderItem.customPrice != null
        ? orderItem.customPrice
        : orderItem.variant.price;
    const originalSubtotal = orderItem.quantity * unitPrice;

    const subtotalCost = this.orderItemUtils.calculateSubTotalCost(orderItem);

    Object.assign(orderItem, {
      subtotal,
      originalSubtotal,
      subtotalCost,
      isGift: variant.product.isGift,
      vatRate,
      vatValue,
    });
    // default discount type is none
    orderItem.voucherValue = 0;
    orderItem.discountType = DiscountType.NONE;
    orderItem.isAppliedPromotion = false;
    orderItem.isAppliedVoucher = false;

    if (!variant.product?.isCustomPrice) {
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
    return orderItem;
  }

  /**
   *
   * @param {GetOrderRequestDto} options The options to retrieved order
   * @returns {Promise<AppPaginatedResponseDto<OrderResponseDto>>} All orders retrieved
   */
  async getAllOrders(
    options: GetOrderRequestDto,
  ): Promise<AppPaginatedResponseDto<OrderResponseDto>> {
    const findOptionsWhere: FindOptionsWhere<Order> = {
      branch: {
        slug: options.branch,
      },
      owner: {
        slug: options.owner,
      },
      table: {
        slug: options.table,
      },
      voucher: {
        slug: options.voucher,
      },
    };

    if (!_.isEmpty(options.status)) {
      findOptionsWhere.status = In(options.status);
    }

    if (options.startDate && !options.endDate) {
      throw new OrderException(OrderValidation.END_DATE_CAN_NOT_BE_EMPTY);
    }

    if (options.endDate && !options.startDate) {
      throw new OrderException(OrderValidation.START_DATE_CAN_NOT_BE_EMPTY);
    }

    if (options.startDate && options.endDate) {
      options.startDate = moment(options.startDate).startOf('day').toDate();
      options.endDate = moment(options.endDate).endOf('day').toDate();
      findOptionsWhere.createdAt = Between(options.startDate, options.endDate);
    }

    const findManyOptions: FindManyOptions<Order> = {
      where: findOptionsWhere,
      relations: {
        owner: true,
        approvalBy: true,
        orderItems: {
          variant: {
            size: true,
            product: true,
          },
          promotion: true,
        },
        payment: true,
        invoice: true,
        table: true,
        chefOrders: true,
        voucher: {
          voucherProducts: {
            product: true,
          },
        },
        deliveryTo: true,
      },
      order: { createdAt: 'DESC' },
    };

    if (options.hasPaging) {
      Object.assign(findManyOptions, {
        skip: (options.page - 1) * options.size,
        take: options.size,
      });
    }

    const [orders, total] =
      await this.orderRepository.findAndCount(findManyOptions);

    // get job print invoice
    const orderIds = orders.map((order) => order.id);

    const printerJobs = await this.printerJobRepository.find({
      where: {
        jobType: PrinterJobType.INVOICE,
        data: In(orderIds),
      },
    });

    // job.data is orderId
    const jobsMap = _.groupBy(printerJobs, (job) => job.data);
    const jobDtosMap = _.mapValues(jobsMap, (jobs) =>
      this.mapper.mapArray(jobs, PrinterJob, PrinterJobResponseDto),
    );

    // order type any because order does not have printerInvoices field
    orders.forEach((order: any) => {
      order.printerInvoices = jobDtosMap[order.id] || [];
    });

    // order does not have printerInvoices field
    // OrderResponseDto have printerInvoices field
    // to map and keep printerInvoices field, need change mapper
    // forMember(
    //   (destination) => destination.printerInvoices,
    //   mapFrom((source: any) => source.printerInvoices),
    // )
    // squeeze type any
    const ordersDto = this.mapper.mapArray(orders, Order, OrderResponseDto);
    const page = options.hasPaging ? options.page : 1;
    const pageSize = options.hasPaging ? options.size : total;

    // Calculate total pages
    const totalPages = Math.ceil(total / pageSize);
    // Determine hasNext and hasPrevious
    const hasNext = page < totalPages;
    const hasPrevious = page > 1;

    return {
      hasNext: hasNext,
      hasPrevios: hasPrevious,
      items: ordersDto,
      total,
      page,
      pageSize,
      totalPages,
    } as AppPaginatedResponseDto<OrderResponseDto>;
  }

  async rePrintFailedInvoicePrinterJobs(slug: string) {
    const context = `${OrderService.name}.${this.rePrintFailedInvoicePrinterJobs.name}`;

    const order = await this.orderRepository.findOne({
      where: { slug },
    });
    if (!order) {
      this.logger.warn(`Order ${slug} not found`, context);
      throw new OrderException(OrderValidation.ORDER_NOT_FOUND);
    }
    if (order.status !== OrderStatus.PAID) {
      this.logger.warn(
        `Order ${slug} is not paid, can not re-print failed invoice printer jobs`,
        context,
      );
      throw new OrderException(OrderValidation.ORDER_IS_NOT_PAID);
    }
    const printerJobs = await this.printerJobRepository.find({
      where: {
        jobType: PrinterJobType.INVOICE,
        data: order.id,
        status: PrinterJobStatus.FAILED,
      },
    });
    printerJobs.map((job) => {
      job.status = PrinterJobStatus.PENDING;
      job.error = null;
    });

    await this.printerJobRepository.save(printerJobs);

    await Promise.all(
      printerJobs.map((job) => this.printerProducer.enqueuePrinterJob(job.id)),
    );

    this.logger.log(
      `Re-print ${printerJobs.length} failed printer jobs for invoice ${slug}`,
      context,
    );
    return this.mapper.mapArray(printerJobs, PrinterJob, PrinterJobResponseDto);
  }

  async getAllOrdersBySlugArray(data: string[]): Promise<OrderResponseDto[]> {
    const orders = await this.orderRepository.find({
      where: { slug: In(data) },
      relations: [
        'owner',
        'approvalBy',
        'orderItems.variant.size',
        'orderItems.variant.product',
        'payment',
        'invoice',
        'table',
        'orderItems.promotion',
        'chefOrders',
        'voucher.voucherProducts.product',
        'deliveryTo',
      ],
      order: { createdAt: 'DESC' },
    });
    return this.mapper.mapArray(orders, Order, OrderResponseDto);
  }

  /**
   *
   * @param {string} slug The slug of order retrieved
   * @returns {Promise<OrderResponseDto>} The order data is retrieved
   * @throws {OrderException} If order is not found
   */
  async getOrderBySlug(slug: string): Promise<OrderResponseDto> {
    // const order = await this.orderUtils.getOrder({ where: { slug } });
    const order = await this.orderRepository.findOne({
      where: { slug },
      relations: {
        payment: true,
        owner: { role: true, userRequirements: true },
        approvalBy: true,
        orderItems: {
          variant: { size: true, product: true },
          promotion: true,
        },
        invoice: true,
        table: true,
        voucher: {
          voucherProducts: { product: true },
          voucherPaymentMethods: true,
          assignedUser: true,
        },
        branch: { addressDetail: true },
        chefOrders: true,
        deliveryTo: true,
      },
    });
    const orderDto = this.mapper.map(order, Order, OrderResponseDto);
    // const orderItems = this.getOrderItemsStatuses(orderDto);
    // orderDto.orderItems = orderItems;
    return orderDto;
  }

  /**
   * Assign status synthesis for each order item in order
   * @param {Order} order The order data relates to tracking
   * @returns {Promise<OrderResponseDto>} The order data with order item have status synthesis
   */
  getOrderItemsStatuses(order: OrderResponseDto): OrderItemResponseDto[] {
    const orderItems = order.orderItems.map((item) => {
      const statusQuantities = item.trackingOrderItems.reduce(
        (acc, trackingItem) => {
          const status = trackingItem.tracking.status;
          acc[status] += trackingItem.quantity;
          return acc;
        },
        {
          [WorkflowStatus.PENDING]: 0,
          [WorkflowStatus.RUNNING]: 0,
          [WorkflowStatus.COMPLETED]: 0,
          [WorkflowStatus.FAILED]: 0,
        } as StatusOrderItemResponseDto,
      );
      return {
        ...item,
        status: statusQuantities,
      } as OrderItemResponseDto;
    });
    return orderItems;
  }

  async getActiveOrderByTable(
    tableSlug: string,
  ): Promise<OrderResponseDto | null> {
    const order = await this.orderUtils.getActiveOrderByTable(tableSlug);
    if (!order) return null;
    return this.mapper.map(order, Order, OrderResponseDto);
  }

  async callCustomerToGetOrder(createdById: string, slug: string) {
    const order = await this.orderUtils.getOrder({ where: { slug } });
    if (!order) {
      throw new OrderException(OrderValidation.ORDER_NOT_FOUND);
    }

    await this.notificationUtils.sendNotificationForCustomerToGetOrder(
      createdById,
      order,
    );
  }

  async changeTable(
    slug: string,
    requestData: ChangeTableRequestDto,
  ): Promise<OrderResponseDto> {
    const context = `${OrderService.name}.${this.changeTable.name}`;

    const order = await this.orderUtils.getOrder({ where: { slug } });

    if (order.status !== OrderStatus.PENDING) {
      this.logger.warn(`Order ${slug} is not pending`, context);
      throw new OrderException(OrderValidation.ORDER_IS_NOT_PENDING);
    }

    if (order.type !== OrderType.AT_TABLE) {
      this.logger.warn(`Order ${slug} is not at-table type`, context);
      throw new OrderException(OrderValidation.ORDER_NOT_AT_TABLE);
    }

    if (order.table?.slug === requestData.newTable) {
      this.logger.warn(`New table is the same as current table`, context);
      throw new OrderException(OrderValidation.NEW_TABLE_MUST_BE_DIFFERENT);
    }

    const newTable = await this.tableUtils.getTable({
      where: { slug: requestData.newTable },
    });

    if (newTable.status !== TableStatus.AVAILABLE) {
      this.logger.warn(
        `Table ${requestData.newTable} is not available`,
        context,
      );
      throw new OrderException(OrderValidation.NEW_TABLE_IS_NOT_AVAILABLE);
    }

    const oldTable = order.table;

    const updatedOrder = await this.transactionManagerService.execute<Order>(
      async (manager) => {
        if (oldTable) {
          oldTable.status = TableStatus.AVAILABLE;
          await manager.save(oldTable);
          this.logger.log(`Table ${oldTable.name} set to available`, context);
        }

        newTable.status = TableStatus.RESERVED;
        await manager.save(newTable);
        this.logger.log(`Table ${newTable.name} set to reserved`, context);

        order.table = newTable;
        return await manager.save(order);
      },
      (result) => {
        this.logger.log(
          `Order ${result.slug} table changed to ${newTable.name}`,
          context,
        );
      },
      (error) => {
        this.logger.warn(
          `Error when changing table for order ${slug}: ${error.message}`,
          context,
        );
        throw new OrderException(OrderValidation.CHANGE_TABLE_ERROR);
      },
    );

    return this.mapper.map(updatedOrder, Order, OrderResponseDto);
  }

  async getVatLink(orderSlug: string): Promise<string> {
    const context = `${OrderService.name}.${this.getVatLink.name}`;
    const order = await this.orderRepository.findOne({
      where: { slug: orderSlug },
      relations: ['invoice'],
    });
    if (!order) {
      throw new OrderException(OrderValidation.ORDER_NOT_FOUND);
    }
    if (
      order.status !== OrderStatus.PAID &&
      order.status !== OrderStatus.COMPLETED &&
      order.status !== OrderStatus.SHIPPING
    ) {
      throw new OrderException(OrderValidation.ORDER_IS_NOT_PAID);
    }
    if (order.invoice) {
      this.logger.log(`Invoice already exists for order ${orderSlug}`, context);
      return order.invoice.slug;
    }
    const invoice = await this.invoiceService.create(orderSlug);
    return invoice.slug;
  }
}
