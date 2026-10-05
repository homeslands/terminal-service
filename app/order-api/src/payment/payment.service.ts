import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Payment } from './entity/payment.entity';
import { PaymentBankingBackup } from './entity/payment-banking-backup.entity';
import { PaymentCallbackRoute } from './entity/payment-callback-route.entity';
import { PaymentCallbackForwardLog } from './entity/payment-callback-forward-log.entity';
import { PaymentCallbackInbox } from './gateway/entity/payment-callback-inbox.entity';
import { Between, FindManyOptions, IsNull, Repository } from 'typeorm';
import { PaymentCallbackRouteClient } from './payment-callback-route.client';
import { PaymentCallbackProducer } from './gateway/payment-callback.producer';
import { CashStrategy } from './strategy/cash.strategy';
import { BankTransferStrategy } from './strategy/bank-transfer.strategy';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  CreatePaymentCallbackRouteRequestDto,
  CreatePaymentDto,
  GetPaymentBankingBackupRequestDto,
  GetPaymentCallbackForwardLogRequestDto,
  GetSpecificPaymentRequestDto,
  PaymentBankingBackupResponseDto,
  PaymentCallbackForwardLogResponseDto,
  PaymentCallbackRouteResponseDto,
  PaymentResponseDto,
  ProcessPaymentCallbackJobDto,
  RetrieveQrTransactionRequestDto,
  UpdatePaymentCallbackRouteRequestDto,
} from './payment.dto';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { Order } from 'src/order/order.entity';
import { v4 as uuidv4 } from 'uuid';
import * as _ from 'lodash';
import { PaymentException } from './payment.exception';
import { PaymentValidation } from './payment.validation';
import {
  PaymentAction,
  PaymentCallbackInboxStatus,
  PaymentCallbackServiceType,
  PaymentMethod,
  PaymentStatus,
} from './payment.constants';
import {
  ACBQrTransactionNotificationRequestDto,
  ACBResponseDto,
  ACBStatusRequestDto,
  ACBTransactionDto,
} from 'src/acb-connector/acb-connector.dto';
import { formatMoment } from 'src/helper';
import moment from 'moment';
import {
  ACBConnectorStatus,
  ACBConnectorTransactionStatus,
} from 'src/acb-connector/acb-connector.constants';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderException } from 'src/order/order.exception';
import { OrderValidation } from 'src/order/order.validation';
import { OrderStatus } from 'src/order/order.constants';
import { PdfService } from 'src/pdf/pdf.service';
import { RoleEnum } from 'src/role/role.enum';
import { UserUtils } from 'src/user/user.utils';
import { CurrentUserDto } from 'src/user/user.dto';
import { PaymentUtils } from './payment.utils';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { PointStrategy } from './strategy/point.strategy';
import { VoucherUtils } from 'src/voucher/voucher.utils';
import {
  VoucherApplicabilityRule,
  VoucherType,
} from 'src/voucher/voucher.constant';
import { OrderUtils } from 'src/order/order.utils';
import { OrderItemUtils } from 'src/order-item/order-item.utils';
import { Voucher } from 'src/voucher/entity/voucher.entity';
import { VoucherException } from 'src/voucher/voucher.exception';
import { VoucherValidation } from 'src/voucher/voucher.validation';
import { CreditCardStrategy } from './strategy/credit-card.strategy';
import { checkUserRequirement } from 'src/auth/auth.utils';
import { UserActiveChecker } from 'src/external-services/shared-user-service/user-active.checker';
import { MembershipCard } from 'src/membership-card/membership-card.entity';
import { MembershipCardException } from 'src/membership-card/membership-card.exception';
import { MembershipCardValidation } from 'src/membership-card/membership-card.validation';
import { UserException } from 'src/user/user.exception';
import { UserValidation } from 'src/user/user.validation';
import { Printer } from 'src/printer/entity/printer.entity';
import { PrinterDataType } from 'src/printer/printer.constants';
import { PrinterConnectorUtils } from 'src/printer-connector/printer-connector.utils';
import { PrinterUtils } from 'src/printer/printer.utils';
import { QrPaymentService } from 'src/qr-payment/qr-payment.service';
import { User } from 'src/user/user.entity';
import { WorkShift } from 'src/work-shift/work-shift.entity';
import { WorkShiftStatus } from 'src/work-shift/work-shift.constants';
import { WorkShiftException } from 'src/work-shift/work-shift.exception';
import {
  WORK_SHIFT_BRANCH_NO_ACTIVE,
  WORK_SHIFT_PAYMENT_FORBIDDEN_FOR_STAFF,
  WorkShiftValidation,
} from 'src/work-shift/work-shift.validation';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(PaymentBankingBackup)
    private readonly paymentBankingBackupRepository: Repository<PaymentBankingBackup>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Printer)
    private readonly printerRepository: Repository<Printer>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    private readonly cashStrategy: CashStrategy,
    private readonly pointStategy: PointStrategy,
    private readonly bankTransferStrategy: BankTransferStrategy,
    private readonly creditCardStrategy: CreditCardStrategy,
    private readonly eventEmitter: EventEmitter2,
    private readonly pdfService: PdfService,
    private readonly userUtils: UserUtils,
    private readonly paymentUtils: PaymentUtils,
    private readonly transactionService: TransactionManagerService,
    private readonly voucherUtils: VoucherUtils,
    private readonly orderUtils: OrderUtils,
    private readonly orderItemUtils: OrderItemUtils,
    @InjectRepository(Voucher)
    private readonly voucherRepository: Repository<Voucher>,
    @InjectRepository(MembershipCard)
    private readonly membershipCardRepository: Repository<MembershipCard>,
    @InjectRepository(PaymentCallbackRoute)
    private readonly paymentCallbackRouteRepository: Repository<PaymentCallbackRoute>,
    @InjectRepository(PaymentCallbackForwardLog)
    private readonly paymentCallbackForwardLogRepository: Repository<PaymentCallbackForwardLog>,
    @InjectRepository(PaymentCallbackInbox)
    private readonly paymentCallbackInboxRepository: Repository<PaymentCallbackInbox>,
    private readonly printerConnectorUtils: PrinterConnectorUtils,
    private readonly printerUtils: PrinterUtils,
    private readonly qrPaymentService: QrPaymentService,
    private readonly paymentCallbackRouteClient: PaymentCallbackRouteClient,
    private readonly paymentCallbackProducer: PaymentCallbackProducer,
    @InjectRepository(WorkShift)
    private readonly workShiftRepository: Repository<WorkShift>,
    private readonly userActiveChecker: UserActiveChecker,
  ) {}

  /**
   * Get payment banking backup records (raw ACB QR transaction notifications)
   * @param {GetPaymentBankingBackupRequestDto} query
   * @returns {Promise<AppPaginatedResponseDto<PaymentBankingBackupResponseDto>>}
   */
  async getPaymentBankingBackups(
    query: GetPaymentBankingBackupRequestDto,
  ): Promise<AppPaginatedResponseDto<PaymentBankingBackupResponseDto>> {
    if (query.startDate && query.endDate) {
      query.startDate = moment(query.startDate).startOf('day').toDate();
      query.endDate = moment(query.endDate).endOf('day').toDate();
    }

    const findManyOptions: FindManyOptions<PaymentBankingBackup> = {
      where: {
        traceNumber: query.traceNumber,
        paymentId: query.paymentId,
        transactionStatus: query.transactionStatus,
        ...(query.startDate &&
          query.endDate && {
            createdAt: Between(query.startDate, query.endDate),
          }),
      },
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    };

    const [backups, total] =
      await this.paymentBankingBackupRepository.findAndCount(findManyOptions);

    const items = this.mapper.mapArray(
      backups,
      PaymentBankingBackup,
      PaymentBankingBackupResponseDto,
    );

    const totalPages = Math.ceil(total / query.size);

    return {
      items,
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<PaymentBankingBackupResponseDto>;
  }

  async getAll() {
    const payments = await this.paymentRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
    return this.mapper.mapArray(payments, Payment, PaymentResponseDto);
  }

  async update(slug: string) {
    const context = `${PaymentService.name}.${this.update.name}`;
    this.logger.log(`Update payment: ${slug}`, context);

    const payment = await this.paymentRepository.findOne({
      where: {
        slug: slug ?? IsNull(),
      },
      relations: ['cardOrder'],
    });

    if (!payment)
      throw new PaymentException(PaymentValidation.PAYMENT_NOT_FOUND);

    payment.statusCode = PaymentStatus.COMPLETED;
    payment.message = 'Thanh toan thanh cong';

    const updated = await this.transactionService.execute<Payment>(
      async (manager) => {
        return await manager.save(payment);
      },
      (res) => {
        this.logger.log(`Payment ${res.slug} updated`, context);
      },
      (error) => {
        this.logger.error(
          `Error when updating payment: ${error.message}`,
          error.stack,
          context,
        );
        throw new PaymentException(PaymentValidation.ERROR_WHEN_UPDATE_PAYEMNT);
      },
    );

    this.logger.log(`Updated payment: ${JSON.stringify(updated)}`, context);

    if (updated.cardOrder) {
      this.eventEmitter.emit(PaymentAction.CARD_ORDER_PAYMENT_PAID, {
        orderSlug: updated.cardOrder?.slug,
      });
    }
  }

  async exportPayment(slug: string) {
    const context = `${PaymentService.name}.${this.exportPayment.name}`;
    const payment = await this.paymentRepository.findOne({
      where: {
        slug,
      },
      relations: ['order'],
    });
    if (!payment) {
      this.logger.warn(`Payment ${slug} not found`, context);
      throw new PaymentException(PaymentValidation.PAYMENT_NOT_FOUND);
    }

    if (payment.paymentMethod !== PaymentMethod.BANK_TRANSFER) {
      this.logger.warn(`Payment ${slug} is not a bank transfer`, context);
      throw new PaymentException(
        PaymentValidation.ONLY_BANK_TRANSFER_CAN_EXPORT,
      );
    }

    const data = await this.pdfService.generatePdf('payment', payment, {
      width: '80mm',
    });

    this.logger.log(`Payment ${payment.slug} exported`, context);

    return data;
  }

  /**
   * Get specific payment
   * @param {GetSpecificPaymentRequestDto} query
   * @returns {Promise<PaymentResponseDto>} payment
   */
  async getSpecific(
    query: GetSpecificPaymentRequestDto,
  ): Promise<PaymentResponseDto> {
    if (_.isEmpty(query)) {
      throw new PaymentException(PaymentValidation.PAYMENT_QUERY_INVALID);
    }
    const payment = await this.paymentRepository.findOne({
      where: { transactionId: query.transaction },
    });
    return this.mapper.map(payment, Payment, PaymentResponseDto);
  }

  /**
   * Initiate payment
   * @param {CreatePaymentDto} createPaymentDto
   * @returns {Promise<PaymentResponseDto>} payment
   */
  async initiate(
    createPaymentDto: CreatePaymentDto,
    currentUser: CurrentUserDto,
  ): Promise<PaymentResponseDto> {
    const context = `${PaymentService.name}.${this.initiate.name}`;

    // created by
    const user = await this.userUtils.getUser({
      where: { id: currentUser.userId ?? IsNull() },
      relations: ['role'],
    });
    // get order
    const order = await this.orderUtils.getOrder({
      where: { slug: createPaymentDto.orderSlug },
    });

    await this.userActiveChecker.assertActive(order.owner);
    checkUserRequirement(order.owner);

    // if order subtotal is less than 2000,
    // set loss === subtotal
    // set subtotal === 0
    // set payment method === CASH

    if (!order) {
      this.logger.error('Order not found', null, context);
      throw new OrderException(OrderValidation.ORDER_NOT_FOUND);
    }

    this.logger.log(
      `Initiate payment for order: ${JSON.stringify(order)}`,
      context,
    );

    if (order.payment) {
      if (
        order.payment.paymentMethod === PaymentMethod.BANK_TRANSFER &&
        createPaymentDto.paymentMethod === PaymentMethod.BANK_TRANSFER &&
        order.subtotal === order.payment.amount
      ) {
        this.logger.warn(
          `Order ${order.slug} already has a payment`,
          null,
          context,
        );
        throw new PaymentException(PaymentValidation.ORDER_ALREADY_HAS_PAYMENT);
      }
    }

    if (order.status !== OrderStatus.PENDING) {
      this.logger.error('Order is not pending', null, context);
      throw new OrderException(
        OrderValidation.ORDER_STATUS_INVALID,
        'Order is not pending',
      );
    }

    if (user.role?.name === RoleEnum.Staff) {
      throw new WorkShiftException(
        WorkShiftValidation[WORK_SHIFT_PAYMENT_FORBIDDEN_FOR_STAFF],
      );
    }

    const activeWorkShift = await this.workShiftRepository.findOne({
      where: {
        branch: { id: order.branch.id },
        status: WorkShiftStatus.ACTIVE,
      },
    });
    if (!activeWorkShift) {
      throw new WorkShiftException(
        WorkShiftValidation[WORK_SHIFT_BRANCH_NO_ACTIVE],
      );
    }

    if (order.voucher) {
      const isVoucherTimeValid = await this.voucherUtils.isVoucherTimeValid(
        order.voucher,
      );
      if (!isVoucherTimeValid) {
        // remove voucher from order
        const removedVoucher = order.voucher;
        if (
          removedVoucher?.applicabilityRule ===
          VoucherApplicabilityRule.ALL_REQUIRED
        ) {
          if (removedVoucher?.type === VoucherType.SAME_PRICE_PRODUCT) {
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
          removedVoucher?.applicabilityRule ===
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
        const { subtotal, originalSubtotal } =
          await this.orderUtils.getOrderSubtotal(order, null);

        order.subtotal = subtotal;
        order.originalSubtotal = originalSubtotal;

        removedVoucher.remainingUsage += 1;
        await this.voucherRepository.save(removedVoucher);
        this.logger.log(
          `Voucher ${removedVoucher.code} has been removed from order ${order.slug}`,
          context,
        );

        await this.orderRepository.save(order);

        throw new VoucherException(VoucherValidation.VOUCHER_IS_EXPIRED);
      }
    }

    // validate voucher payment method
    await this.voucherUtils.validateVoucherPaymentMethod(
      order.voucher, // if voucher is null, return true
      createPaymentDto.paymentMethod,
    );

    let payment: Payment;
    // Customer resolved from QR token (only set when dto.qrToken is provided)
    let qrCustomer: User | null = null;

    if (user.role?.name === RoleEnum.Customer) {
      switch (createPaymentDto.paymentMethod) {
        case PaymentMethod.BANK_TRANSFER:
          if (order.subtotal < 2000) {
            order.loss = order.subtotal;
            order.subtotal = 0;
            createPaymentDto.paymentMethod = PaymentMethod.CASH;
            payment = await this.cashStrategy.process(order);
            break;
          }
          payment = await this.bankTransferStrategy.process(order);
          break;
        case PaymentMethod.POINT:
          payment = await this.pointStategy.process(order);
          break;
        default:
          this.logger.error('Customer only use bank transfer', null, context);
          throw new PaymentException(
            PaymentValidation.CUSTOMER_ONLY_USE_BANK_TRANSFER,
          );
      }
    } else if (
      user.role?.name === RoleEnum.Cashier ||
      user.role?.name === RoleEnum.Manager ||
      user.role?.name === RoleEnum.Admin ||
      user.role?.name === RoleEnum.SuperAdmin
    ) {
      // Assign cashier for order
      order.approvalBy = user;

      switch (createPaymentDto.paymentMethod) {
        case PaymentMethod.BANK_TRANSFER:
          if (order.subtotal < 2000) {
            order.loss = order.subtotal;
            order.subtotal = 0;
            createPaymentDto.paymentMethod = PaymentMethod.CASH;
            payment = await this.cashStrategy.process(order);
            break;
          }
          payment = await this.bankTransferStrategy.process(order);
          break;
        case PaymentMethod.CREDIT_CARD:
          if (order.subtotal < 2000) {
            order.loss = order.subtotal;
            order.subtotal = 0;
            createPaymentDto.paymentMethod = PaymentMethod.CASH;
            payment = await this.cashStrategy.process(order);
            break;
          }
          payment = await this.creditCardStrategy.process(
            order,
            createPaymentDto.transactionId,
          );
          break;
        case PaymentMethod.CASH:
          if (order.subtotal < 2000) {
            order.loss = order.subtotal;
            order.subtotal = 0;
          }
          payment = await this.cashStrategy.process(order);
          break;
        case PaymentMethod.POINT: {
          if (createPaymentDto.qrToken) {
            // QR scan flow: delegate QR authentication to QrPaymentService.
            // QrPaymentService.verify only checks token / idempotency / owner /
            // branch — it does NOT repeat order/balance/voucher checks already
            // handled by initiate + pointStrategy.
            qrCustomer = await this.qrPaymentService.verify(
              createPaymentDto.qrToken,
              order,
              currentUser,
            );
          } else {
            // Membership card flow (existing behavior, untouched)
            if (!createPaymentDto.membershipCard) {
              this.logger.error('Membership card is required', null, context);
              throw new MembershipCardException(
                MembershipCardValidation.MEMBERSHIP_CARD_CODE_REQUIRED,
              );
            }
            const membershipCard = await this.membershipCardRepository.findOne({
              where: { code: createPaymentDto.membershipCard },
              relations: { user: true },
            });
            if (!membershipCard) {
              this.logger.error('Membership card not found', null, context);
              throw new MembershipCardException(
                MembershipCardValidation.MEMBERSHIP_CARD_NOT_FOUND,
              );
            }
            if (!membershipCard.user) {
              this.logger.error(
                'Membership card user not found',
                null,
                context,
              );
              throw new UserException(UserValidation.USER_NOT_FOUND);
            }

            if (order.owner?.role?.name !== RoleEnum.Customer) {
              this.logger.error('User is not a customer', null, context);
              throw new UserException(UserValidation.OWNER_NOT_A_CUSTOMER);
            }

            if (membershipCard.user.id !== order.owner.id) {
              this.logger.error(
                'Membership card user is not the order owner',
                null,
                context,
              );
              throw new MembershipCardException(
                MembershipCardValidation.MEMBERSHIP_CARD_USER_IS_NOT_THE_ORDER_OWNER,
              );
            }
          }

          payment = await this.pointStategy.process(order);
          break;
        }
        default:
          this.logger.error('Invalid payment method', null, context);
          throw new PaymentException(PaymentValidation.PAYMENT_METHOD_INVALID);
      }
    } else {
      this.logger.error('Role not allowed to initiate payment', null, context);
      throw new PaymentException(
        PaymentValidation.ROLE_NOT_ALLOWED_TO_INITIATE_PAYMENT,
      );
    }

    this.logger.log(`Created Payment: ${JSON.stringify(payment)}`, context);

    // Delete previous payment
    if (order.payment) {
      // await this.paymentRepository.softRemove(order.payment);
      await this.paymentUtils.cancelPayment(order.payment.slug);
    }

    // Update order
    order.payment = payment;

    await this.orderRepository.save(order);

    if (
      payment.paymentMethod === PaymentMethod.CASH ||
      payment.paymentMethod === PaymentMethod.POINT ||
      payment.paymentMethod === PaymentMethod.CREDIT_CARD
    ) {
      // Update order status
      this.eventEmitter.emit(PaymentAction.PAYMENT_PAID, { orderId: order.id });
    }

    // QR scan flow finalization: set idempotency key + push notification.
    // Only fires when initiate was called with dto.qrToken (resolved customer
    // is captured into qrCustomer inside the POINT case above).
    if (createPaymentDto.qrToken && qrCustomer) {
      await this.qrPaymentService.finalize(
        createPaymentDto.qrToken,
        order,
        qrCustomer,
      );
    }

    return this.mapper.map(payment, Payment, PaymentResponseDto);
  }

  async initiatePublic(
    createPaymentDto: CreatePaymentDto,
  ): Promise<PaymentResponseDto> {
    const context = `${PaymentService.name}.${this.initiatePublic.name}`;
    // get order
    const order = await this.orderUtils.getOrder({
      where: { slug: createPaymentDto.orderSlug },
    });
    if (order.owner?.phonenumber !== 'default-customer') {
      this.logger.error('Initiate public payment denied', null, context);
      throw new PaymentException(
        PaymentValidation.INITIATE_PUBLIC_PAYMENT_DENIED,
      );
    }

    await this.userActiveChecker.assertActive(order.owner);
    checkUserRequirement(order.owner);

    if (order.status !== OrderStatus.PENDING) {
      this.logger.error('Order is not pending', null, context);
      throw new OrderException(
        OrderValidation.ORDER_STATUS_INVALID,
        'Order is not pending',
      );
    }

    if (order.voucher) {
      const isVoucherTimeValid = await this.voucherUtils.isVoucherTimeValid(
        order.voucher,
      );
      if (!isVoucherTimeValid) {
        // remove voucher from order
        const removedVoucher = order.voucher;
        if (
          removedVoucher?.applicabilityRule ===
          VoucherApplicabilityRule.ALL_REQUIRED
        ) {
          if (removedVoucher?.type === VoucherType.SAME_PRICE_PRODUCT) {
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
          removedVoucher?.applicabilityRule ===
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
        const { subtotal, originalSubtotal } =
          await this.orderUtils.getOrderSubtotal(order, null);

        order.subtotal = subtotal;
        order.originalSubtotal = originalSubtotal;

        removedVoucher.remainingUsage += 1;
        await this.voucherRepository.save(removedVoucher);
        this.logger.log(
          `Voucher ${removedVoucher.code} has been removed from order ${order.slug}`,
          context,
        );

        await this.orderRepository.save(order);

        throw new VoucherException(VoucherValidation.VOUCHER_IS_EXPIRED);
      }
    }

    // validate voucher payment method
    await this.voucherUtils.validateVoucherPaymentMethod(
      order.voucher, // if voucher is null, return true
      createPaymentDto.paymentMethod,
    );

    // if (order.payment) {
    //   this.logger.warn(
    //     `Order ${order.slug} already has a payment`,
    //     null,
    //     context,
    //   );
    //   throw new PaymentException(PaymentValidation.ORDER_ALREADY_HAS_PAYMENT);
    // }

    if (order.payment) {
      if (
        order.payment.paymentMethod === PaymentMethod.BANK_TRANSFER &&
        createPaymentDto.paymentMethod === PaymentMethod.BANK_TRANSFER &&
        order.subtotal === order.payment.amount
      ) {
        this.logger.warn(
          `Order ${order.slug} already has a payment`,
          null,
          context,
        );
        throw new PaymentException(PaymentValidation.ORDER_ALREADY_HAS_PAYMENT);
      }
    }

    let payment: Payment;

    switch (createPaymentDto.paymentMethod) {
      case PaymentMethod.BANK_TRANSFER:
        if (order.subtotal < 2000) {
          order.loss = order.subtotal;
          order.subtotal = 0;
          createPaymentDto.paymentMethod = PaymentMethod.CASH;
          payment = await this.cashStrategy.process(order);
          break;
        }
        payment = await this.bankTransferStrategy.process(order);
        break;
      default:
        this.logger.error('Invalid payment method', null, context);
        throw new PaymentException(PaymentValidation.PAYMENT_METHOD_INVALID);
    }
    this.logger.log(`Created Payment: ${JSON.stringify(payment)}`, context);

    // Delete previous payment
    if (order.payment) {
      await this.paymentUtils.cancelPayment(order.payment.slug);
    }

    // Update order
    order.payment = payment;

    await this.orderRepository.save(order);

    if (payment.paymentMethod === PaymentMethod.CASH) {
      // Update order status
      this.eventEmitter.emit(PaymentAction.PAYMENT_PAID, { orderId: order.id });
    }
    return this.mapper.map(payment, Payment, PaymentResponseDto);
  }

  /**
   * Callback update payment status.
   *
   * Gateway-style split (see payment/gateway.md, giai đoạn 1): this method only
   * validates the payload, guards against duplicate bank retries (idempotent on
   * traceNumber), and builds the ACK for ACB from data already available
   * synchronously. The actual routing (internal update / external forward) is
   * enqueued and handled by `processCallbackJob` in the background, so the ACK
   * never blocks on it.
   * @param {ACBStatusRequestDto} requestData
   * @returns {Promise<ACBResponseDto>}
   * @throws {PaymentException}
   */
  async callback(requestData: ACBStatusRequestDto): Promise<ACBResponseDto> {
    const context = `${PaymentService.name}.${this.callback.name}`;
    const transaction =
      requestData.requestParameters?.request?.requestParams?.transactions?.[0];
    if (!transaction) {
      this.logger.error('Transaction not found', null, context);
      throw new PaymentException(PaymentValidation.TRANSACTION_NOT_FOUND);
    }

    const traceNumber = transaction.transactionEntityAttribute?.traceNumber;
    const custom1 = transaction.transactionEntityAttribute?.custom1;
    const route = custom1
      ? await this.paymentCallbackRouteRepository.findOne({
          where: { code: custom1, isActive: true },
        })
      : null;

    const { inbox, isDuplicate } = await this.getOrCreateCallbackInbox(
      traceNumber,
      custom1,
      requestData,
    );

    const response =
      route?.serviceType === PaymentCallbackServiceType.EXTERNAL
        ? this.buildExternalAckResponse(transaction)
        : await this.buildInternalAckResponse(transaction, context);

    if (isDuplicate) {
      this.logger.warn(
        `Duplicate callback for traceNumber ${traceNumber}, replaying ack without reprocessing`,
        context,
      );
    } else {
      await this.paymentCallbackProducer.enqueueProcessCallback({
        inboxId: inbox.id,
        routeCode: custom1,
        transaction,
        requestData,
      });
    }

    this.logger.warn(`Callback response: ${JSON.stringify(response)}`, context);
    return response;
  }

  /**
   * Insert the raw callback into the inbox before any routing decision, keyed
   * uniquely by traceNumber, so a bank retry of the same transaction is
   * detected here instead of being processed a second time.
   */
  private async getOrCreateCallbackInbox(
    traceNumber: string,
    routeCode: string | undefined,
    requestData: ACBStatusRequestDto,
  ): Promise<{ inbox: PaymentCallbackInbox; isDuplicate: boolean }> {
    const existing = await this.paymentCallbackInboxRepository.findOne({
      where: { traceNumber },
    });
    if (existing) return { inbox: existing, isDuplicate: true };

    try {
      const inbox = await this.paymentCallbackInboxRepository.save(
        this.paymentCallbackInboxRepository.create({
          traceNumber,
          routeCode,
          rawPayload: JSON.stringify(requestData),
        }),
      );
      return { inbox, isDuplicate: false };
    } catch {
      // Lost the race against a concurrent callback for the same traceNumber.
      const inbox = await this.paymentCallbackInboxRepository.findOneOrFail({
        where: { traceNumber },
      });
      return { inbox, isDuplicate: true };
    }
  }

  private buildExternalAckResponse(
    transaction: ACBTransactionDto,
  ): ACBResponseDto {
    return {
      requestTrace: uuidv4(),
      responseDateTime: formatMoment(),
      responseStatus: {
        responseCode: ACBConnectorStatus.SUCCESS,
        responseMessage: transaction.transactionStatus,
      },
      responseBody: {
        index: 1,
        referenceCode:
          transaction.transactionEntityAttribute?.traceNumber ?? '',
      },
    } as ACBResponseDto;
  }

  private async buildInternalAckResponse(
    transaction: ACBTransactionDto,
    context: string,
  ): Promise<ACBResponseDto> {
    const payment = await this.paymentRepository.findOne({
      where: {
        transactionId: transaction.transactionEntityAttribute.traceNumber,
      },
    });

    if (!payment) {
      this.logger.error('Payment not found', null, context);
      throw new PaymentException(PaymentValidation.PAYMENT_NOT_FOUND);
    }

    return {
      requestTrace: uuidv4(),
      responseDateTime: formatMoment(),
      responseStatus: {
        responseCode:
          transaction.transactionStatus ===
          ACBConnectorTransactionStatus.COMPLETED
            ? ACBConnectorStatus.SUCCESS
            : ACBConnectorStatus.BAD_REQUEST,
        responseMessage: transaction.transactionStatus,
      },
      responseBody: {
        index: 1,
        referenceCode: payment.slug,
      },
    } as ACBResponseDto;
  }

  /**
   * Background worker for `payment-callback` jobs (see PaymentCallbackConsumer).
   * Runs the routing that used to live inline in `callback()`: forward to the
   * external service, or update the payment/order internally. Failures mark
   * the inbox row FAILED and rethrow so BullMQ retries with backoff instead of
   * silently dropping the transaction.
   */
  async processCallbackJob(
    payload: ProcessPaymentCallbackJobDto,
  ): Promise<void> {
    const context = `${PaymentService.name}.${this.processCallbackJob.name}`;
    const { inboxId, routeCode, transaction, requestData } = payload;

    try {
      const route = routeCode
        ? await this.paymentCallbackRouteRepository.findOne({
            where: { code: routeCode, isActive: true },
          })
        : null;

      if (route?.serviceType === PaymentCallbackServiceType.EXTERNAL) {
        await this.backupForwardedTransaction(route, transaction);
        this.logger.log(
          `Forwarding callback (custom1: ${route.code}) to external service ${route.targetUrl}`,
          context,
        );
        await this.paymentCallbackRouteClient.forward(route, requestData);
      } else {
        await this.applyInternalPaymentUpdate(transaction, context);
      }

      await this.paymentCallbackInboxRepository.update(inboxId, {
        status: PaymentCallbackInboxStatus.PROCESSED,
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to process payment callback (inbox: ${inboxId}): ${error.message}`,
        error.stack,
        context,
      );
      await this.paymentCallbackInboxRepository.increment(
        { id: inboxId },
        'retryCount',
        1,
      );
      await this.paymentCallbackInboxRepository.update(inboxId, {
        status: PaymentCallbackInboxStatus.FAILED,
        lastError: error.message,
      });
      throw error;
    }
  }

  private async applyInternalPaymentUpdate(
    transaction: ACBTransactionDto,
    context: string,
  ): Promise<void> {
    const payment = await this.paymentRepository.findOne({
      where: {
        transactionId: transaction.transactionEntityAttribute.traceNumber,
      },
      relations: ['order', 'cardOrder'],
    });

    this.logger.log(`Payment: ${JSON.stringify(payment)}`, context);

    if (!payment) {
      this.logger.error('Payment not found', null, context);
      throw new PaymentException(PaymentValidation.PAYMENT_NOT_FOUND);
    }

    const statusCode =
      transaction.transactionStatus === ACBConnectorTransactionStatus.COMPLETED
        ? PaymentStatus.COMPLETED
        : PaymentStatus.FAILED;

    Object.assign(payment, {
      statusCode: statusCode,
      statusMessage: statusCode,
    });

    const updatedPayment = await this.paymentRepository.save(payment);
    this.logger.log(`Payment ${updatedPayment.id}`, context);

    if (payment.order)
      this.eventEmitter.emit(PaymentAction.PAYMENT_PAID, {
        orderId: payment.order?.id,
      });

    if (payment.cardOrder) {
      this.eventEmitter.emit(PaymentAction.CARD_ORDER_PAYMENT_PAID, {
        orderSlug: payment.cardOrder?.slug,
      });
    }
  }

  /**
   * Persist the raw transaction as a PaymentCallbackForwardLog record before forwarding,
   * so the terminal keeps an audit trail even though the transaction is processed elsewhere.
   * @param {PaymentCallbackRoute} route
   * @param {ACBTransactionDto} transaction
   */
  private async backupForwardedTransaction(
    route: PaymentCallbackRoute,
    transaction: ACBTransactionDto,
  ) {
    const context = `${PaymentService.name}.${this.backupForwardedTransaction.name}`;
    try {
      const log = new PaymentCallbackForwardLog();
      Object.assign(log, {
        routeCode: route.code,
        targetUrl: route.targetUrl,
        traceNumber: transaction.transactionEntityAttribute?.traceNumber,
        transactionStatus: transaction.transactionStatus,
        transactionChannel: transaction.transactionChannel,
        transactionDate: transaction.transactionDate,
        effectiveDate: transaction.effectiveDate,
        debitOrCredit: transaction.debitOrCredit,
        amount: transaction.amount,
        transactionContent: transaction.transactionContent,
        beneficiaryName:
          transaction.transactionEntityAttribute?.beneficiaryName,
        virtualAccount: transaction.transactionEntityAttribute?.virtualAccount,
        rawPayload: JSON.stringify(transaction),
      } as Partial<PaymentCallbackForwardLog>);

      const saved = await this.paymentCallbackForwardLogRepository.save(log);
      this.logger.log(
        `Backed up forwarded transaction ${saved.slug} (route: ${route.code})`,
        context,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to backup forwarded transaction (route: ${route.code}): ${error.message}`,
        error.stack,
        context,
      );
    }
  }

  /**
   * Get payment callback forward logs (raw payloads forwarded to external services)
   * @param {GetPaymentCallbackForwardLogRequestDto} query
   * @returns {Promise<AppPaginatedResponseDto<PaymentCallbackForwardLogResponseDto>>}
   */
  async getCallbackForwardLogs(
    query: GetPaymentCallbackForwardLogRequestDto,
  ): Promise<AppPaginatedResponseDto<PaymentCallbackForwardLogResponseDto>> {
    if (query.startDate && query.endDate) {
      query.startDate = moment(query.startDate).startOf('day').toDate();
      query.endDate = moment(query.endDate).endOf('day').toDate();
    }

    const findManyOptions: FindManyOptions<PaymentCallbackForwardLog> = {
      where: {
        routeCode: query.routeCode,
        traceNumber: query.traceNumber,
        transactionStatus: query.transactionStatus,
        ...(query.startDate &&
          query.endDate && {
            createdAt: Between(query.startDate, query.endDate),
          }),
      },
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    };

    const [logs, total] =
      await this.paymentCallbackForwardLogRepository.findAndCount(
        findManyOptions,
      );

    const items = this.mapper.mapArray(
      logs,
      PaymentCallbackForwardLog,
      PaymentCallbackForwardLogResponseDto,
    );

    const totalPages = Math.ceil(total / query.size);

    return {
      items,
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<PaymentCallbackForwardLogResponseDto>;
  }

  /**
   * Get all payment callback routes
   * @returns {Promise<PaymentCallbackRouteResponseDto[]>}
   */
  async getCallbackRoutes(): Promise<PaymentCallbackRouteResponseDto[]> {
    const routes = await this.paymentCallbackRouteRepository.find({
      order: { createdAt: 'DESC' },
    });
    return this.mapper.mapArray(
      routes,
      PaymentCallbackRoute,
      PaymentCallbackRouteResponseDto,
    );
  }

  /**
   * Create a payment callback route
   * @param {CreatePaymentCallbackRouteRequestDto} requestData
   * @returns {Promise<PaymentCallbackRouteResponseDto>}
   */
  async createCallbackRoute(
    requestData: CreatePaymentCallbackRouteRequestDto,
  ): Promise<PaymentCallbackRouteResponseDto> {
    const context = `${PaymentService.name}.${this.createCallbackRoute.name}`;
    const existed = await this.paymentCallbackRouteRepository.findOne({
      where: { code: requestData.code },
    });
    if (existed) {
      throw new PaymentException(
        PaymentValidation.PAYMENT_CALLBACK_ROUTE_CODE_EXISTED,
      );
    }

    const route = this.mapper.map(
      requestData,
      CreatePaymentCallbackRouteRequestDto,
      PaymentCallbackRoute,
    );

    const createdRoute =
      await this.transactionService.execute<PaymentCallbackRoute>(
        async (manager) => manager.save(route),
        (result) => {
          this.logger.log(
            `Payment callback route ${result.slug} created`,
            context,
          );
        },
        (error) => {
          this.logger.error(
            `Failed to create payment callback route: ${error.message}`,
            error.stack,
            context,
          );
          throw new PaymentException(
            PaymentValidation.PAYMENT_CALLBACK_ROUTE_CREATION_FAILED,
            error.message,
          );
        },
      );

    return this.mapper.map(
      createdRoute,
      PaymentCallbackRoute,
      PaymentCallbackRouteResponseDto,
    );
  }

  /**
   * Update a payment callback route
   * @param {string} slug
   * @param {UpdatePaymentCallbackRouteRequestDto} requestData
   * @returns {Promise<PaymentCallbackRouteResponseDto>}
   */
  async updateCallbackRoute(
    slug: string,
    requestData: UpdatePaymentCallbackRouteRequestDto,
  ): Promise<PaymentCallbackRouteResponseDto> {
    const context = `${PaymentService.name}.${this.updateCallbackRoute.name}`;
    const route = await this.paymentCallbackRouteRepository.findOne({
      where: { slug: slug ?? IsNull() },
    });
    if (!route) {
      throw new PaymentException(
        PaymentValidation.PAYMENT_CALLBACK_ROUTE_NOT_FOUND,
      );
    }

    Object.assign(route, { ...requestData });

    const updatedRoute =
      await this.transactionService.execute<PaymentCallbackRoute>(
        async (manager) => manager.save(route),
        (result) => {
          this.logger.log(
            `Payment callback route ${result.slug} updated`,
            context,
          );
        },
        (error) => {
          this.logger.error(
            `Failed to update payment callback route: ${error.message}`,
            error.stack,
            context,
          );
          throw new PaymentException(
            PaymentValidation.PAYMENT_CALLBACK_ROUTE_UPDATE_FAILED,
            error.message,
          );
        },
      );

    return this.mapper.map(
      updatedRoute,
      PaymentCallbackRoute,
      PaymentCallbackRouteResponseDto,
    );
  }

  /**
   * Receive QR transaction notification list from ACB
   * @param {ACBQrTransactionNotificationRequestDto} requestData
   * @returns {Promise<ACBResponseDto>}
   */
  async qrTransactionNotification(
    requestData: ACBQrTransactionNotificationRequestDto,
  ): Promise<ACBResponseDto> {
    const context = `${PaymentService.name}.${this.qrTransactionNotification.name}`;
    this.logger.log(
      `QR transaction notification received: ${JSON.stringify(requestData)}`,
      context,
    );

    const transactions =
      requestData.requestParameters?.request?.requestParams?.transactions ?? [];

    for (const transaction of transactions) {
      const traceNumber = transaction.transactionEntityAttribute?.traceNumber;
      try {
        const payment = traceNumber
          ? await this.paymentRepository.findOne({
              where: { transactionId: traceNumber },
            })
          : null;

        const backup = new PaymentBankingBackup();
        Object.assign(backup, {
          traceNumber,
          transactionStatus: transaction.transactionStatus,
          transactionChannel: transaction.transactionChannel,
          transactionDate: transaction.transactionDate,
          effectiveDate: transaction.effectiveDate,
          debitOrCredit: transaction.debitOrCredit,
          amount: transaction.amount,
          transactionContent: transaction.transactionContent,
          beneficiaryName:
            transaction.transactionEntityAttribute?.beneficiaryName,
          beneficiaryAccountNumber:
            transaction.transactionEntityAttribute?.beneficiaryAccountNumber,
          receiverBankName:
            transaction.transactionEntityAttribute?.receiverBankName,
          virtualAccount:
            transaction.transactionEntityAttribute?.virtualAccount,
          referenceNumber:
            transaction.transactionEntityAttribute?.referenceNumber,
          partnerCustomerCode:
            transaction.transactionEntityAttribute?.partnerCustomerCode,
          partnerCustomerName:
            transaction.transactionEntityAttribute?.partnerCustomerName,
          partnerCustomerType:
            transaction.transactionEntityAttribute?.partnerCustomerType,
          paymentId: payment?.id,
          rawPayload: JSON.stringify(transaction),
        } as Partial<PaymentBankingBackup>);

        const savedBackup =
          await this.paymentBankingBackupRepository.save(backup);
        this.logger.log(
          `QR transaction notification: backed up transaction ${savedBackup.slug} (trace number ${traceNumber})`,
          context,
        );
      } catch (error: any) {
        this.logger.error(
          `QR transaction notification: error backing up trace number ${traceNumber}: ${error?.message}`,
          error?.stack,
          context,
        );
      }

      // Keep for later use: auto-update payment status directly from this
      // notification (currently only backing up raw data, see above).
      // if (!traceNumber) {
      //   this.logger.warn(
      //     `QR transaction notification missing trace number: ${JSON.stringify(transaction)}`,
      //     context,
      //   );
      //   continue;
      // }

      // const payment = await this.paymentRepository.findOne({
      //   where: { transactionId: traceNumber },
      //   relations: ['order', 'cardOrder'],
      // });

      // if (!payment) {
      //   this.logger.warn(
      //     `QR transaction notification: payment not found for trace number ${traceNumber}`,
      //     context,
      //   );
      //   continue;
      // }

      // if (
      //   [
      //     PaymentStatus.COMPLETED,
      //     PaymentStatus.FAILED,
      //     PaymentStatus.CANCELLED,
      //   ].includes(payment.statusCode)
      // ) {
      //   this.logger.log(
      //     `QR transaction notification: payment ${payment.slug} already resolved with status ${payment.statusCode}, skip`,
      //     context,
      //   );
      //   continue;
      // }

      // let statusCode: string;
      // if (
      //   transaction.transactionStatus ===
      //   ACBConnectorTransactionStatus.COMPLETED
      // ) {
      //   statusCode = PaymentStatus.COMPLETED;
      // } else if (
      //   transaction.transactionStatus ===
      //   ACBConnectorTransactionStatus.ERRORCORRECTED
      // ) {
      //   statusCode = PaymentStatus.FAILED;
      // } else {
      //   this.logger.warn(
      //     `QR transaction notification: unmapped transaction status ${transaction.transactionStatus} for trace number ${traceNumber}`,
      //     context,
      //   );
      //   continue;
      // }

      // Object.assign(payment, {
      //   statusCode: statusCode,
      //   statusMessage: statusCode,
      // });

      // const updatedPayment = await this.paymentRepository.save(payment);
      // this.logger.log(
      //   `QR transaction notification: payment ${updatedPayment.slug} updated to ${statusCode}`,
      //   context,
      // );

      // if (payment.order) {
      //   this.eventEmitter.emit(PaymentAction.PAYMENT_PAID, {
      //     orderId: payment.order?.id,
      //   });
      // }

      // if (payment.cardOrder) {
      //   this.eventEmitter.emit(PaymentAction.CARD_ORDER_PAYMENT_PAID, {
      //     orderSlug: payment.cardOrder?.slug,
      //   });
      // }
    }

    const response = {
      requestTrace: uuidv4(),
      responseDateTime: formatMoment(),
      responseStatus: {
        responseCode: ACBConnectorStatus.SUCCESS,
        responseMessage: 'Received successfully',
      },
      responseBody: {
        index: 1,
        referenceCode: uuidv4(),
      },
    } as ACBResponseDto;
    return response;
  }

  /**
   * Retrieve QR transactions from ACB
   * @param {RetrieveQrTransactionRequestDto} query
   * @returns {Promise<ACBRetrieveQRCodeResponseBodyDto>}
   */
  async retrieveQrTransactions(query: RetrieveQrTransactionRequestDto) {
    const context = `${PaymentService.name}.${this.retrieveQrTransactions.name}`;
    this.logger.log(
      `Retrieve QR transactions: ${JSON.stringify(query)}`,
      context,
    );

    const response = await this.bankTransferStrategy.retrieveQRCode(query);
    return response.responseBody;
  }

  async autoPrintPayment(slug: string): Promise<void> {
    const context = `${PaymentService.name}.${this.autoPrintPayment.name}`;

    const payment = await this.paymentRepository.findOne({
      where: { slug },
      relations: ['order', 'order.branch'],
    });

    if (!payment) {
      this.logger.warn(`Payment ${slug} not found`, context);
      throw new PaymentException(PaymentValidation.PAYMENT_NOT_FOUND);
    }

    if (payment.paymentMethod !== PaymentMethod.BANK_TRANSFER) {
      this.logger.warn(`Payment ${slug} is not a bank transfer`, context);
      throw new PaymentException(
        PaymentValidation.ONLY_BANK_TRANSFER_CAN_EXPORT,
      );
    }

    const rawBase64 = await this.printerUtils.createPaymentEscPosBase64(slug);

    const branch = payment.order?.branch;
    if (!branch) {
      this.logger.warn(`Branch not found for payment ${slug}`, context);
      return;
    }

    const printers = await this.printerRepository.find({
      where: { invoiceArea: { branch: { id: branch.id } }, isActive: true },
      relations: { invoiceArea: { branch: true } },
    });
    const activePrinters = printers.filter(
      (p) => p.printerId && p.dataType === PrinterDataType.ESC_POS,
    );

    if (activePrinters.length === 0) {
      this.logger.warn(
        `No active ESC/POS invoice printers for branch ${branch.slug}`,
        context,
      );
      return;
    }

    for (const printer of activePrinters) {
      await this.printerConnectorUtils.printInvoicePassthrough(
        branch.slug,
        printer.printerId,
        `payment-${slug}`,
        rawBase64,
        0,
        printer.numberPrinting ?? 1,
      );
    }

    this.logger.log(
      `Auto printed payment ${slug} on ${activePrinters.length} printer(s)`,
      context,
    );
  }
}
