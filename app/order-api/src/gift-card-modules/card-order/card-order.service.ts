import { CreateRecipientDto } from 'src/gift-card-modules/receipient/dto/create-recipient.dto';
import { Recipient } from 'src/gift-card-modules/receipient/entities/receipient.entity';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CreateCardOrderDto } from './dto/create-card-order.dto';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  IsNull,
  Like,
  MoreThan,
  Repository,
} from 'typeorm';
import { CardOrder } from './entities/card-order.entity';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Card } from '../card/entities/card.entity';
import { User } from 'src/user/user.entity';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { Mapper } from '@automapper/core';
import { CardOrderResponseDto } from './dto/card-order-response.dto';
import { FindAllCardOrderDto } from './dto/find-all-card-order.dto';
import { InjectMapper } from '@automapper/nestjs';
import { CardOrderException } from './card-order.exception';
import { CardOrderValidation } from './card-order.validation';
import { CardOrderStatus, CardOrderType } from './card-order.enum';
import { createSortOptions } from 'src/shared/utils/obj.util';
import { OrderException } from 'src/order/order.exception';
import { BankTransferStrategy } from 'src/payment/strategy/bank-transfer.strategy';
import {
  InitiateCardOrderPaymentAdminDto,
  InitiateCardOrderPaymentDto,
} from './dto/initiate-card-order-payment.dto';
import { CardException } from '../card/card.exception';
import { CardValidation } from '../card/card.validation';
import { GiftCardService } from '../gift-card/gift-card.service';
import { PointTransactionObjectTypeEnum } from '../point-transaction/entities/point-transaction.enum';
import _ from 'lodash';
import {
  PaymentMethod,
  PaymentMethodMapper,
  PaymentStatus,
} from 'src/payment/payment.constants';
import { FeatureFlag } from '../feature-flag/entities/feature-flag.entity';
import { FeatureFlagException } from '../feature-flag/feature-flag.exception';
import { FeatureFlagValidation } from '../feature-flag/feature-flag.validation';
import { FeatureGroupConstant } from '../feature-flag/feature-group.constant';
import { assertUserKeyLoaded } from 'src/user/user.constant';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { Payment } from 'src/payment/entity/payment.entity';
import { CashStrategy } from 'src/payment/strategy/cash.strategy';
import { PaymentException } from 'src/payment/payment.exception';
import { PaymentValidation } from 'src/payment/payment.validation';
import { PaymentUtils } from 'src/payment/payment.utils';
import { checkUserRequirement } from 'src/auth/auth.utils';
import { UserActiveChecker } from 'src/external-services/shared-user-service/user-active.checker';
import { CoinPolicyException } from '../coin-policy/coin-policy.exception';
import { CoinPolicyValidation } from '../coin-policy/coin-policy.validation';
import { SharedCoinPolicyService } from 'src/shared/services/shared-coin-policy.service';
import { IsMaxBalancePayload } from 'src/shared/interfaces/commons/shared-coin-policy.interface';
import { NotificationUtils } from 'src/notification/notification.utils';
import { CurrentUserDto } from 'src/user/user.dto';
import { UserException } from 'src/user/user.exception';
import { UserValidation } from 'src/user/user.validation';
import { ExportFilename } from 'src/shared/constants/export-filename.constant';
import { ExcelConfig } from 'src/shared/interfaces/commons/excel-config.interface';
import { ExcelUtil } from 'src/shared/utils/excel.util';
import { CurrencyUtil } from 'src/shared/utils/currency.util';
import moment from 'moment';
import { SharedExportFileService } from 'src/shared/services/shared-export-file.service';
import { CardOrderStatusMapper } from './card-order.constants';
import {
  SharedUserLookupResponse,
  SharedUserServiceClient,
} from 'src/external-services/shared-user-service/shared-user-service.client';
import { cardOrderIdempotencyKey } from 'src/shared/constants/service-ref.constant';
import { batchLookupSharedUserIdentities } from 'src/user/user.helper';

// Buoc 5.3 (5-a): ten chep vao cot snapshot lay tu identity cua shared-user.
// Bo phan rong thay vi ghi "null null" nhu khi ghep thang hai cot cuc bo (cache
// ten cuc bo rong o phan lon user - do 16/11/2026).
const fullNameOf = (identity: SharedUserLookupResponse): string =>
  [identity.firstName, identity.lastName].filter(Boolean).join(' ');

/** Ten + SDT chep vao cot snapshot cua don the / nguoi nhan (buoc 5.3). */
type IdentitySnapshot = { name: string; phone: string };

@Injectable()
export class CardOrderService {
  constructor(
    @InjectRepository(CardOrder)
    private cardOrderRepository: Repository<CardOrder>,
    @InjectRepository(Card)
    private cardRepository: Repository<Card>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(FeatureFlag)
    private featureRepository: Repository<FeatureFlag>,
    // @InjectRepository(CoinPolicy)
    // private coinPolicyRepository: Repository<CoinPolicy>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    @InjectMapper()
    private readonly mapper: Mapper,
    private readonly transactionService: TransactionManagerService,
    private readonly bankTransferStrategy: BankTransferStrategy,
    private readonly gcService: GiftCardService,
    // Buoc 7.7b: bo SharedBalanceService + SharedPointTransactionService - cong
    // xu va dong so cai di qua `sharedUserServiceClient.creditBalance`.
    // Buoc 5.2 (5-a4) bo `SharedUserRefService` khoi tep nay: moi khoa vi cua
    // don the / nguoi nhan doc `.sharedUserId` tu quan he da nap (`customer`,
    // `receipients.recipient`) hoac tu ban ghi `user` vua tra, qua
    // `assertUserKeyLoaded` - khong con dich tu cot slug. (2.12/2.13 dich slug
    // vi khi do chua cau nao nap hai quan he nay.)
    private readonly cashStrategy: CashStrategy,
    private readonly paymentUtils: PaymentUtils,
    private readonly sharedCoinPolicyService: SharedCoinPolicyService,
    private readonly sharedExportFileService: SharedExportFileService,
    private readonly notificationUtils: NotificationUtils,
    private readonly userActiveChecker: UserActiveChecker,
    private readonly sharedUserServiceClient: SharedUserServiceClient,
  ) { }

  /**
   * Buoc 5.3 (5-a) - nguon cua cac cot snapshot ten/SDT (`customerName`,
   * `customerPhone`, `cashierName`, `cashierPhone`, `cancelByName`; `name`,
   * `phone`, `senderName`, `senderPhone` cua nguoi nhan): identity cua
   * shared-user, KHONG phai hang `user_tbl` cuc bo - cache ten cuc bo rong o
   * phan lon user (ghi ra "null null"), phan con lai co the da lech.
   *
   * - MOT luot `lookupByIds` (qua `batchLookupSharedUserIdentities`) cho moi
   *   nguoi cua mot thao tac, goi TRUOC lenh ghi dau tien.
   * - Fail-closed: shared-user khong tra loi ⇒ 503
   *   (`SharedUserUnavailableException`, ma 162001); mot nguoi khong co
   *   identity ⇒ loi "not found" cua vai do (`notFound`). Khong bao gio chep
   *   tu cot cuc bo "cho xong".
   * - Chep xong thi thoi: doc don cu KHONG ghep lai - khach doi ten hom nay
   *   khong lam doi ten da in tren the phat hanh truoc do.
   * - `xId`, `xSlug`, quan he `x` giu nguyen - khoa cua trend.
   */
  private async lookupSnapshotIdentities(
    people: Array<User | null | undefined>,
    context: string,
  ): Promise<Map<string, SharedUserLookupResponse>> {
    return await batchLookupSharedUserIdentities(
      people.map((person) => person?.sharedUserId),
      this.sharedUserServiceClient,
      this.logger,
      context,
    );
  }

  private snapshotOf(
    identityById: Map<string, SharedUserLookupResponse>,
    person: User,
    notFound: () => Error,
    context: string,
  ): IdentitySnapshot {
    const identity = person.sharedUserId
      ? identityById.get(person.sharedUserId)
      : undefined;
    if (!identity) {
      this.logger.warn(
        `No shared-user identity for local user ${person.id} (sharedUserId ${person.sharedUserId}): card order snapshot not written`,
        context,
      );
      throw notFound();
    }
    return { name: fullNameOf(identity), phone: identity.phonenumber };
  }

  private buildExcelConfig() {
    const excelConfig = new ExcelConfig();
    const headers = [
      {
        header: 'Thứ tự đơn',
        key: 'sequence',
        width: ExcelUtil.WIDTH_COL_MEDIUM
      },
      {
        header: 'Mã đơn hàng',
        key: 'code',
        width: ExcelUtil.WIDTH_COL_MEDIUM,
      },
      {
        header: 'Phương thức thanh toán',
        key: 'paymentMethod',
        width: ExcelUtil.WIDTH_COL_MEDIUM,
      },
      {
        header: 'Trạng thái',
        key: 'status',
        width: ExcelUtil.WIDTH_COL_MEDIUM,
      },
      {
        header: 'Tổng tiền (VNĐ)',
        key: 'totalAmount',
        width: ExcelUtil.WIDTH_COL_MEDIUM,
      },
      {
        header: 'Thu ngân',
        key: 'cashierName',
        width: ExcelUtil.WIDTH_COL_MEDIUM,
      },
      {
        header: 'Khách hàng',
        key: 'customerName',
        width: ExcelUtil.WIDTH_COL_MEDIUM,
      },
      {
        header: 'Ngày tạo',
        key: 'createdAt',
        width: ExcelUtil.WIDTH_COL_SHORT,
      },
    ];
    excelConfig.headers = headers;
    return excelConfig;
  }

  private buildData(data: CardOrder[]) {
    const exportData = data.map((item) => ({
      ...item,
      code: item.code || '',
      sequence: item?.sequence ? item.sequence : 'N/A',
      totalAmount: CurrencyUtil.formatCurrency(item?.totalAmount),
      paymentMethod: PaymentMethodMapper[item?.paymentMethod],
      createdAt: item.createdAt
        ? moment(item.createdAt).format('HH:mm:ss DD/MM/YYYY')
        : null,
      status: CardOrderStatusMapper[item?.status],
    }));
    return exportData;
  }

  async exportExcel(payload: FindAllCardOrderDto) {
    const { sort } = payload;

    const whereOpts:
      | FindOptionsWhere<CardOrder>
      | FindOptionsWhere<CardOrder>[] = this.buildFindOptionsWhere(payload);

    const sortOpts = createSortOptions<CardOrder>(sort);

    const [cardOrders] = await this.cardOrderRepository.findAndCount({
      relations: {
        receipients: true,
        giftCards: true,
      },
      where: whereOpts,
      order: sortOpts,
      withDeleted: true,
    });

    const filename = ExportFilename.EXPORT_CARD_ORDERS;
    const excelConfig = this.buildExcelConfig();
    const data = this.buildData(cardOrders);

    return await this.sharedExportFileService.exportExcel(
      filename,
      excelConfig,
      data,
    );
  }

  async initiatePayment(payload: InitiateCardOrderPaymentDto) {
    const context = `${CardOrderService.name}.${this.initiatePayment.name}`;
    this.logger.log(`Initiate a payment: ${JSON.stringify(payload)}`, context);

    const cardOrder = await this.cardOrderRepository.findOne({
      where: { slug: payload.cardorderSlug ?? IsNull() },
      relations: {
        payment: true,
        customer: true,
        // Buoc 5.2: nap `recipient` de doc khoa vi tu quan he (response khong
        // doi: `RecipientResponseDto` khong co field `recipient`).
        receipients: { recipient: true },
      },
    });
    if (!cardOrder)
      throw new CardOrderException(CardOrderValidation.CARD_ORDER_NOT_FOUND);

    if (cardOrder.status !== CardOrderStatus.PENDING)
      throw new OrderException(CardOrderValidation.CARD_ORDER_NOT_PENDING);

    const customerIdentity = await this.userActiveChecker.assertActive(
      cardOrder.customer,
    );
    checkUserRequirement(customerIdentity?.userRequirements);

    switch (cardOrder.type) {
      case CardOrderType.GIFT:
        for (const receipient of cardOrder.receipients) {
          const isMaxBalancePayload: IsMaxBalancePayload = {
            totalPoints: receipient.quantity * cardOrder.cardPoint,
            // Buoc 5.2: khoa doc tu quan he `receipients.recipient` vua nap,
            // khong dich tu cot slug.
            sharedUserId: assertUserKeyLoaded(
              receipient.recipient?.sharedUserId,
              context,
            ),
          };
          if (
            await this.sharedCoinPolicyService.isExceedBalance(
              isMaxBalancePayload,
            )
          )
            throw new CoinPolicyException(
              CoinPolicyValidation.EXCEED_MAXIMUM_BALANCE,
            );
        }
        break;
      case CardOrderType.SELF:
        const isMaxBalancePayload: IsMaxBalancePayload = {
          totalPoints: cardOrder.cardPoint * cardOrder.quantity,
          // `customer: true` co trong `relations` o day ⇒ doc thang khoa, khong
          // phai dich. Doc `.sharedUserId` chu KHONG `.slug` (SOT 1, 12/09).
          // Buoc 5.2: qua `assertUserKeyLoaded` - khoa rong lot vao thi
          // `findOneByField` chi bao BALANCE_NOT_FOUND, mat dau vet "quan he
          // chua nap".
          sharedUserId: assertUserKeyLoaded(
            cardOrder.customer?.sharedUserId,
            context,
          ),
        };
        if (
          await this.sharedCoinPolicyService.isExceedBalance(
            isMaxBalancePayload,
          )
        )
          throw new CoinPolicyException(
            CoinPolicyValidation.EXCEED_MAXIMUM_BALANCE,
          );
        break;
    }

    if (cardOrder.payment)
      return this.mapper.map(cardOrder, CardOrder, CardOrderResponseDto);

    const payment = await this.bankTransferStrategy.processCardOrder(cardOrder);

    // Update card order
    cardOrder.payment = payment;
    Object.assign(cardOrder, {
      payment,
      paymentMethod: payment.paymentMethod,
      paymentId: payment.id,
      paymentSlug: payment.slug,
    } as Partial<CardOrder>);

    await this.cardOrderRepository.save(cardOrder);
    this.transactionService.execute<CardOrder>(
      async (manager) => {
        return await manager.save(cardOrder);
      },
      (result) => {
        this.logger.log(`Card order payment: ${result.slug} updated`, context);
      },
      (err) => {
        this.logger.log(
          `Error when updating card order: ${err.message}`,
          err.stack,
          context,
        );
      },
    );

    return this.mapper.map(cardOrder, CardOrder, CardOrderResponseDto);
  }

  async initiatePaymentAdmin(payload: InitiateCardOrderPaymentAdminDto) {
    const context = `${CardOrderService.name}.${this.initiatePayment.name}`;

    const cashier = await this.userRepository.findOne({
      where: { slug: payload.cashierSlug },
    });
    if (!cashier)
      throw new CardOrderException(CardOrderValidation.CASHIER_NOT_FOUND);

    const cardOrder = await this.cardOrderRepository.findOne({
      where: { slug: payload.cardorderSlug ?? IsNull() },
      relations: {
        payment: true,
        customer: true,
        // Buoc 5.2: nap `recipient` de doc khoa vi tu quan he (response khong
        // doi: `RecipientResponseDto` khong co field `recipient`).
        receipients: { recipient: true },
      },
    });
    if (!cardOrder)
      throw new CardOrderException(CardOrderValidation.CARD_ORDER_NOT_FOUND);

    if (cardOrder.status !== CardOrderStatus.PENDING)
      throw new OrderException(CardOrderValidation.CARD_ORDER_NOT_PENDING);

    const customerIdentity = await this.userActiveChecker.assertActive(
      cardOrder.customer,
    );
    checkUserRequirement(customerIdentity?.userRequirements);

    switch (cardOrder.type) {
      case CardOrderType.GIFT:
        for (const receipient of cardOrder.receipients) {
          const isMaxBalancePayload: IsMaxBalancePayload = {
            totalPoints: receipient.quantity * cardOrder.cardPoint,
            // Buoc 5.2: khoa doc tu quan he `receipients.recipient` vua nap,
            // khong dich tu cot slug.
            sharedUserId: assertUserKeyLoaded(
              receipient.recipient?.sharedUserId,
              context,
            ),
          };
          if (
            await this.sharedCoinPolicyService.isExceedBalance(
              isMaxBalancePayload,
            )
          )
            throw new CoinPolicyException(
              CoinPolicyValidation.EXCEED_MAXIMUM_BALANCE,
            );
        }
        break;
      case CardOrderType.SELF:
        const isMaxBalancePayload: IsMaxBalancePayload = {
          totalPoints: cardOrder.cardPoint * cardOrder.quantity,
          // `customer: true` co trong `relations` o day ⇒ doc thang khoa, khong
          // phai dich. Doc `.sharedUserId` chu KHONG `.slug` (SOT 1, 12/09).
          // Buoc 5.2: qua `assertUserKeyLoaded` - khoa rong lot vao thi
          // `findOneByField` chi bao BALANCE_NOT_FOUND, mat dau vet "quan he
          // chua nap".
          sharedUserId: assertUserKeyLoaded(
            cardOrder.customer?.sharedUserId,
            context,
          ),
        };
        if (
          await this.sharedCoinPolicyService.isExceedBalance(
            isMaxBalancePayload,
          )
        )
          throw new CoinPolicyException(
            CoinPolicyValidation.EXCEED_MAXIMUM_BALANCE,
          );
        break;
    }

    if (_.isEmpty(payload.paymentMethod)) {
      this.logger.error('Invalid payment method', null, context);
      throw new PaymentException(PaymentValidation.PAYMENT_METHOD_INVALID);
    }

    // Handle payment method req is not changed
    if (
      cardOrder?.payment &&
      payload.paymentMethod === cardOrder?.payment?.paymentMethod
    )
      return this.mapper.map(cardOrder, CardOrder, CardOrderResponseDto);

    // Buoc 5.3: identity thu ngan cho snapshot - tra TRUOC lenh ghi dau tien
    // (huy payment cu) de shared-user hong thi 503 ma khong ghi gi.
    const cashierSnapshot = this.snapshotOf(
      await this.lookupSnapshotIdentities([cashier], context),
      cashier,
      () => new CardOrderException(CardOrderValidation.CASHIER_NOT_FOUND),
      context,
    );

    // Handle cancel payment before using other payment method
    const prevPayment = cardOrder.payment;
    if (prevPayment) {
      if (prevPayment?.paymentMethod === PaymentMethod.BANK_TRANSFER) {
        // Cancel QR Code
      }
      Object.assign(prevPayment, {
        statusCode: PaymentStatus.CANCELLED,
      } as Partial<Payment>);

      await this.transactionService.execute<Payment>(
        async (manager) => {
          return await manager.save(prevPayment);
        },
        (result) => {
          this.logger.log(`Payment ${result.slug} is cancelled`, context);
        },
        (err) => {
          this.logger.log(
            `Error when cancel payment: ${err.message}`,
            err.stack,
            context,
          );
        },
      );
    }

    // Assign new payment
    let payment: Payment = null;
    switch (payload.paymentMethod) {
      case PaymentMethod.BANK_TRANSFER:
        payment = await this.bankTransferStrategy.processCardOrder(cardOrder);
        break;
      case PaymentMethod.CASH:
        payment = await this.cashStrategy.processCardOrder(cardOrder);
        break;
      default:
        this.logger.error('Invalid payment method', null, context);
        throw new PaymentException(PaymentValidation.PAYMENT_METHOD_INVALID);
    }

    const sequence = await this.buildSequence();

    // Update card order
    Object.assign(cardOrder, {
      sequence,
      payment,
      paymentMethod: payment.paymentMethod,
      paymentId: payment.id,
      paymentSlug: payment.slug,
      paymentStatus: payment.statusCode,
      cashier: cashier,
      cashierId: cashier.id,
      cashierName: cashierSnapshot.name,
      cashierPhone: cashierSnapshot.phone,
      cashierSlug: cashier.slug,
    } as Partial<CardOrder>);

    if (payment.paymentMethod === PaymentMethod.CASH) {
      cardOrder.status = payment.statusCode;
    }

    await this.cardOrderRepository.save(cardOrder);
    this.transactionService.execute<CardOrder>(
      async (manager) => {
        return await manager.save(cardOrder);
      },
      (result) => {
        this.logger.log(`Card order payment: ${result.slug} updated`, context);
      },
      (err) => {
        this.logger.log(
          `Error when updating card order: ${err.message}`,
          err.stack,
          context,
        );
      },
    );

    if (payment.paymentMethod === PaymentMethod.CASH) {
      await this._generateAndRedeem(cardOrder);
      await this.notificationUtils.sendNotificationAfterCardOrderIsPaid(cardOrder);
    }

    return this.mapper.map(cardOrder, CardOrder, CardOrderResponseDto);
  }

  async cancel(slug: string, userDto: CurrentUserDto): Promise<void> {
    const context = `${CardOrderService.name}.${this.cancel.name}`;
    this.logger.log(`Cancelling card order: ${slug}`, context);

    const canceler = await this.userRepository.findOne({
      where: {
        id: userDto.userId,
      },
    });

    if (!canceler)
      throw new UserException(
        UserValidation.USER_NOT_FOUND,
        'Canceler not found',
      );

    const cardOrder = await this.cardOrderRepository.findOne({
      where: { slug },
      relations: ['payment'],
    });

    if (!cardOrder) {
      throw new CardOrderException(CardOrderValidation.CARD_ORDER_NOT_FOUND);
    }

    if (cardOrder.status !== CardOrderStatus.PENDING) {
      throw new CardOrderException(CardOrderValidation.CARD_ORDER_NOT_PENDING);
    }

    // Buoc 5.3: ten nguoi huy cho snapshot - tra TRUOC khi huy payment.
    const cancelerSnapshot = this.snapshotOf(
      await this.lookupSnapshotIdentities([canceler], context),
      canceler,
      () =>
        new UserException(UserValidation.USER_NOT_FOUND, 'Canceler not found'),
      context,
    );

    if (cardOrder.payment)
      await this.paymentUtils.cancelPayment(cardOrder.payment?.slug);

    Object.assign(cardOrder, {
      status: CardOrderStatus.CANCELLED,
      paymentStatus: PaymentStatus.CANCELLED,
      cancelBySlug: canceler.slug,
      cancelByName: cancelerSnapshot.name,
      cancelAt: new Date(),
    } as CardOrder);

    await this.cardOrderRepository.save(cardOrder);
  }

  private async buildCode() {
    // Pattern: DHC + MMDDYY + 4 digits of daily sequence + 3 digits unique
    const whereOptions: FindOptionsWhere<CardOrder> = {
      createdAt: Between(
        moment().startOf('day').toDate(),
        moment().endOf('day').toDate(),
      ),
    };
    const prefix = 'DHC';
    const datePart = moment().format('DDMMYY');
    const uniquePart = Date.now().toString(36).toUpperCase().slice(-3);
    const currentTotalOrder = await this.cardOrderRepository.count({
      where: whereOptions,
    });
    const postfix = (currentTotalOrder + 1).toString().padStart(4, '0');
    const pattern = prefix.concat(datePart, postfix, uniquePart);
    return pattern;
  }

  private async buildSequence() {
    const DEFAULT_SEQUENCE = 1;
    const whereOptions: FindOptionsWhere<CardOrder> = {
      status: CardOrderStatus.COMPLETED,
    };
    const currentSequence = await this.cardOrderRepository.maximum(
      'sequence',
      whereOptions,
    );
    return currentSequence ? currentSequence + 1 : DEFAULT_SEQUENCE;
  }

  async create(createCardOrderDto: CreateCardOrderDto) {
    const context = `${CardOrderService.name}.${this.create.name}`;

    const featureFlag = await this.featureRepository.findOne({
      where: {
        name: createCardOrderDto.cardOrderType,
        groupName: FeatureGroupConstant.GIFT_CARD,
      },
    });

    if (featureFlag?.isLocked) {
      throw new FeatureFlagException(FeatureFlagValidation.FEATURE_IS_LOCKED);
    }

    const card = await this.cardRepository.findOne({
      where: {
        slug: createCardOrderDto.cardSlug,
      },
    });

    if (!card) {
      throw new CardException(CardValidation.CARD_NOT_FOUND);
    }

    if (!card.isActive) {
      throw new CardOrderException(CardOrderValidation.CARD_IS_NOT_ACTIVE);
    }

    const customer = await this.userRepository.findOne({
      where: {
        slug: createCardOrderDto.customerSlug || IsNull(),
      },
    });

    if (!customer) {
      throw new CardOrderException(
        CardOrderValidation.CARD_ORDER_CUSTOMER_NOT_FOUND,
      );
    }

    const customerIdentity =
      await this.userActiveChecker.assertActive(customer);
    checkUserRequirement(customerIdentity?.userRequirements);

    const cashier = await this.userRepository.findOne({
      where: {
        slug: createCardOrderDto.cashierSlug || IsNull(),
      },
    });

    if (!cashier) {
      this.logger.warn('Cashier not found', context);
    }

    const totalAmount = card.price * createCardOrderDto.quantity;
    if (totalAmount !== createCardOrderDto.totalAmount) {
      throw new CardOrderException(
        CardOrderValidation.CARD_ORDER_TOTAL_AMOUNT_NOT_CORRECT,
      );
    }

    const totalQuantity = createCardOrderDto.receipients.reduce(
      (acc, recipient) => {
        return acc + recipient.quantity;
      },
      0,
    );

    if (totalQuantity > createCardOrderDto.quantity) {
      throw new CardOrderException(
        CardOrderValidation.CARD_ORDER_TOTAL_QUANTITY_NOT_CORRECT,
      );
    }

    // Buoc 5.3: vong nay chi tim + kiem tran tung nguoi nhan; ban ghi
    // `Recipient` dung SAU khi tra identity MOT luot cho ca lo (ben duoi).
    let recipientUsers: User[] = [];

    switch (createCardOrderDto.cardOrderType) {
      case CardOrderType.GIFT:
        recipientUsers = await Promise.all(
          createCardOrderDto.receipients.map(async (createReceipientDto) => {
            const receipient = await this.userRepository.findOne({
              where: {
                slug: createReceipientDto.recipientSlug,
              },
            });

            if (!receipient) {
              throw new CardOrderException(
                CardOrderValidation.CARD_ORDER_RECIPIENT_NOT_FOUND,
              );
            }

            const isMaxBalancePayload: IsMaxBalancePayload = {
              totalPoints: createReceipientDto.quantity * card.points,
              // Buoc 5.2: da co ban ghi `user` cua nguoi nhan (tra ngay tren)
              // ⇒ doc thang khoa, khong tra them lan nua theo slug.
              sharedUserId: assertUserKeyLoaded(
                receipient.sharedUserId,
                context,
              ),
            };
            if (
              await this.sharedCoinPolicyService.isExceedBalance(
                isMaxBalancePayload,
              )
            )
              throw new CoinPolicyException(
                CoinPolicyValidation.EXCEED_MAXIMUM_BALANCE,
              );

            return receipient;
          }),
        );
        break;
      case CardOrderType.SELF:
        const isMaxBalancePayload: IsMaxBalancePayload = {
          totalPoints: createCardOrderDto.quantity * card.points,
          // Co ban ghi `customer` tai cho ⇒ doc thang `.sharedUserId`.
          sharedUserId: assertUserKeyLoaded(customer.sharedUserId, context),
        };
        if (
          await this.sharedCoinPolicyService.isExceedBalance(
            isMaxBalancePayload,
          )
        )
          throw new CoinPolicyException(
            CoinPolicyValidation.EXCEED_MAXIMUM_BALANCE,
          );
        break;
    }

    // Buoc 5.3 (5-a): MOT luot tra identity cho chu don, thu ngan va moi
    // nguoi nhan, TRUOC lenh ghi dau tien. Fail-closed - xem
    // `lookupSnapshotIdentities`.
    const identityById = await this.lookupSnapshotIdentities(
      [customer, cashier, ...recipientUsers],
      context,
    );
    const customerSnapshot = this.snapshotOf(
      identityById,
      customer,
      () =>
        new CardOrderException(
          CardOrderValidation.CARD_ORDER_CUSTOMER_NOT_FOUND,
        ),
      context,
    );
    const cashierSnapshot = cashier
      ? this.snapshotOf(
          identityById,
          cashier,
          () => new CardOrderException(CardOrderValidation.CASHIER_NOT_FOUND),
          context,
        )
      : null;

    const receipients: Recipient[] = recipientUsers.map((receipient, index) => {
      const recipientSnapshot = this.snapshotOf(
        identityById,
        receipient,
        () =>
          new CardOrderException(
            CardOrderValidation.CARD_ORDER_RECIPIENT_NOT_FOUND,
          ),
        context,
      );
      const receipientItem = this.mapper.map(
        createCardOrderDto.receipients[index],
        CreateRecipientDto,
        Recipient,
      );

      Object.assign(receipientItem, {
        name: recipientSnapshot.name,
        phone: recipientSnapshot.phone,
        recipientId: receipient.id,
        recipientSlug: receipient.slug,
        recipient: receipient,

        senderId: customer.id,
        senderSlug: customer.slug,
        senderName: customerSnapshot.name,
        senderPhone: customerSnapshot.phone,
        sender: customer,
      } as Partial<Recipient>);

      return receipientItem;
    });

    const cardOrder = this.mapper.map(
      createCardOrderDto,
      CreateCardOrderDto,
      CardOrder,
    );

    const code = await this.buildCode();

    Object.assign(cardOrder, {
      type: createCardOrderDto.cardOrderType,
      code,

      cardId: card.id,
      cardSlug: card.slug,
      cardPoint: card.points,
      cardTitle: card.title,
      cardImage: card.image,
      cardPrice: card.price,
      card,

      customerId: customer.id,
      customerSlug: customer.slug,
      customerName: customerSnapshot.name,
      customerPhone: customerSnapshot.phone,
      customer,

      cashierId: cashier ? cashier.id : null,
      cashierSlug: cashier ? cashier.slug : null,
      cashierName: cashierSnapshot ? cashierSnapshot.name : null,
      cashierPhone: cashierSnapshot ? cashierSnapshot.phone : null,
      cashier: cashier ? cashier : null,
    } as Partial<CardOrder>);

    const createdCardOrder = await this.transactionService.execute<CardOrder>(
      async (manager) => {
        const createdCardOrder = await manager.save(cardOrder as CardOrder);

        if (createdCardOrder.type === CardOrderType.GIFT) {
          receipients.forEach((item: Recipient) => {
            item.cardOrder = createdCardOrder;
            item.cardOrderSlug = createdCardOrder.slug;
            item.cardOrderId = createdCardOrder.id;
          });
          await manager.save(receipients);
        }
        return createdCardOrder;
      },
      (result) => {
        this.logger.log(
          `Created card order: ${JSON.stringify(result)}`,
          context,
        );
      },
      (error) => {
        this.logger.error(
          `Error creating card order: ${error.message}`,
          error.stack,
          context,
        );
        throw error;
      },
    );
    return this.mapper.map(createdCardOrder, CardOrder, CardOrderResponseDto);
  }

  private buildFindOptionsWhere(req: FindAllCardOrderDto) {
    const findOptionsWhere: FindOptionsWhere<CardOrder> = {};

    if (req.customerSlug) {
      findOptionsWhere.customerSlug = req.customerSlug;
    }

    if (req.status) {
      findOptionsWhere.status = req.status;
    }

    if (req.fromDate && !req.toDate) {
      findOptionsWhere.createdAt = MoreThan(req.fromDate);
    }

    if (req.fromDate && req.toDate) {
      findOptionsWhere.createdAt = Between(req.fromDate, req.toDate);
    }

    if (req.paymentMethod) {
      findOptionsWhere.paymentMethod = req.paymentMethod;
    }

    if (req.k) {
      return [
        { ...findOptionsWhere, cashierName: Like(`%${req.k}%`) },
        { ...findOptionsWhere, customerName: Like(`%${req.k}%`) },
      ] as FindOptionsWhere<CardOrder>[];
    }

    return findOptionsWhere;
  }

  async findAll(payload: FindAllCardOrderDto) {
    const context = `${CardOrderService.name}.${this.findAll.name}`;
    this.logger.log(`Find all card order: ${JSON.stringify(payload)}`, context);

    const { page, size, sort } = payload;

    const whereOpts:
      | FindOptionsWhere<CardOrder>
      | FindOptionsWhere<CardOrder>[] = this.buildFindOptionsWhere(payload);

    const sortOpts = createSortOptions<CardOrder>(sort);

    const [cardOrders, total] = await this.cardOrderRepository.findAndCount({
      relations: ['receipients', 'giftCards'],
      where: whereOpts,
      order: sortOpts,
      take: size,
      skip: (page - 1) * size,
      // withDeleted: true,
    });

    // Calculate total pages
    const totalPages = Math.ceil(total / size);
    // Determine hasNext and hasPrevious
    const hasNext = page < totalPages;
    const hasPrevious = page > 1;

    return {
      hasNext: hasNext,
      hasPrevios: hasPrevious,
      items: this.mapper.mapArray(cardOrders, CardOrder, CardOrderResponseDto),
      total,
      page: page,
      pageSize: size,
      totalPages,
    } as AppPaginatedResponseDto<CardOrderResponseDto>;
  }

  async findOne(slug: string) {
    const context = `${CardOrderService.name}.${this.findOne.name}`;
    this.logger.log(`Find one card order: ${slug}`, context);

    const cardOrder = await this.cardOrderRepository.findOne({
      where: {
        slug,
      },
      relations: ['receipients', 'giftCards'],
    });
    if (!cardOrder) {
      throw new CardOrderException(CardOrderValidation.CARD_ORDER_NOT_FOUND);
    }
    return this.mapper.map(cardOrder, CardOrder, CardOrderResponseDto);
  }

  async generateAndRedeem(slug: string) {
    // Cua (1) - `POST :slug/gift-card/gen` (admin bam tay). GIU NGUYEN LOI GOC
    // - BE-16 (`progress/loi-co-tu-truoc.md`), sua gop sau giai doan 10 (nguoi
    // dung chot 17/11/2026; buoc 5.1 chi gac role o controller). Phep kiem
    // `COMPLETED && _.isEmpty(co.giftCards)` luon dung o nhanh GIFT/SELF (hai
    // nhanh nay khong bao gio dien `giftCards`), lai khong khoa hang ⇒ bam bao
    // nhieu lan thi cong xu bay nhieu lan. Chi nhanh BUY bi chan.
    const co = await this.cardOrderRepository.findOne({
      where: { slug },
      relations: ['receipients', 'giftCards'],
    });
    if (!co)
      throw new CardOrderException(CardOrderValidation.CARD_ORDER_NOT_FOUND);

    if (co.status === CardOrderStatus.COMPLETED && _.isEmpty(co.giftCards))
      await this._generateAndRedeem(co);
    else
      throw new CardOrderException(
        CardOrderValidation.GIFT_CARD_HAS_ALREADY_GENERATED,
      );
  }

  // GIU NGUYEN LOI GOC (nguoi dung chot 17/11/2026 - buoc 5.1 chi gac role; sua
  // gop sau giai doan 10, `progress/loi-co-tu-truoc.md`): ham nay khong kiem
  // "don da cong chua" va khong khoa hang. Ba cua goi thang - (1)
  // `generateAndRedeem`, (2) `initiatePaymentAdmin` (tien mat), (3)
  // `handlePaymentCompletion` (listener thanh toan) - nen goi lap / song song
  // la cong lap (BE-16). Cua (3) goi ca khi don `FAIL` ⇒ don thanh toan hong
  // van duoc cong (BE-10).
  async _generateAndRedeem(cardOrder: CardOrder) {
    const context = `${CardOrderService.name}.${this._generateAndRedeem.name}`;
    this.logger.log(`handle card payment order success req`, context);

    // Buoc 5.2 (5-a4): CAU NAY la noi duy nhat nap nguoi duoc cong - `customer`
    // (SELF) va `receipients.recipient` (GIFT). Ba cua chi can truyen don (doc
    // `slug`), khong cua nao phai nho tu nap hai quan he nay, het chuyen "quen
    // mot duong ⇒ khoa `undefined`". Doc lai don, KHONG khoa hang: loi cong
    // trung giu nguyen (BE-16, xem comment tren ham).
    const databaseEntity = await this.cardOrderRepository.findOne({
      where: { slug: cardOrder.slug },
      relations: ['customer', 'receipients', 'receipients.recipient'],
    });
    if (!databaseEntity)
      throw new CardOrderException(CardOrderValidation.CARD_ORDER_NOT_FOUND);

    // Buoc 5.2: kiem du khoa vi cua MOI nguoi duoc cong TRUOC lenh ghi dau tien.
    // Thieu mot khoa ⇒ nem (400 / 137000), khong ai duoc cong. De toi luc cong
    // moi phat hien thi don GIFT da cong xong nguoi nhan dau roi moi hong o
    // nguoi thu hai.
    if (databaseEntity.type === CardOrderType.SELF)
      assertUserKeyLoaded(databaseEntity.customer?.sharedUserId, context);
    if (databaseEntity.type === CardOrderType.GIFT)
      for (const receipient of databaseEntity.receipients)
        assertUserKeyLoaded(receipient.recipient?.sharedUserId, context);

    switch (databaseEntity.type) {
      case CardOrderType.GIFT:
        for (const item of databaseEntity.receipients) {
          const { quantity } = item;
          let totalAmount = 0;
          for (let i = 0; i < quantity; i++) {
            // 1. Gen
            // const gc = await this.gcService.gen({
            //   cardOrderSlug: databaseEntity.slug,
            //   cardSlug: databaseEntity.cardSlug,
            // });

            // 2. Auto-redeem
            // await this.gcService.redeem({
            //   code: gc.code,
            //   serial: gc.serial,
            //   userSlug: recipientSlug,
            // } as UseGiftCardDto);

            totalAmount += databaseEntity.cardPoint;
          }

          // MOT nguon khoa cho ca ba lenh cua nguoi nhan nay - quan he
          // `receipients.recipient` nap o dau ham (buoc 5.2), khong dich slug.
          const recipientSharedUserId = assertUserKeyLoaded(
            item.recipient?.sharedUserId,
            context,
          );

          // Buoc 7.7b (trend-api.md 7.4(b)): cong xu vao vi shared-user - MOT lenh
          // mang ca dong so cai (objectType/objectId/objectSlug/desc) va tra so du
          // sau khi cong: khong con luot doc-sau-cong, khong con lenh tao dong
          // `point_transaction` rieng. Khoa cardOrderIdempotencyKey(<slug don>, <sharedUserId
          // NGUOI NHAN nay>) - Z-2: moi nguoi nhan mot khoa. Goi lai
          // `_generateAndRedeem` (BE-16) => `replayed`, khong cong lan hai.
          await this.sharedUserServiceClient.creditBalance({
            userId: recipientSharedUserId,
            points: totalAmount,
            transactionId: cardOrderIdempotencyKey(
              databaseEntity.slug,
              recipientSharedUserId,
            ),
            objectType: PointTransactionObjectTypeEnum.CARD_ORDER,
            objectId: databaseEntity.id,
            objectSlug: databaseEntity.slug,
            desc: `Nạp ${totalAmount.toLocaleString()} xu từ người gửi ${databaseEntity.customerName}(${databaseEntity.customerPhone})`,
          });
        }
        break;
      case CardOrderType.SELF:
        let totalAmount = 0;
        for (let i = 0; i < databaseEntity.quantity; i++) {
          // 1. Gen
          // const gc = await this.gcService.gen({
          //   cardOrderSlug: databaseEntity.slug,
          //   cardSlug: databaseEntity.cardSlug,
          // });

          // 2. Auto-redeem
          // await this.gcService.redeem({
          //   code: gc.code,
          //   serial: gc.serial,
          //   userSlug: databaseEntity.customerSlug,
          // } as UseGiftCardDto);

          totalAmount += databaseEntity.cardPoint;
        }

        // MOT nguon khoa cho ca ba lenh cua chu don - quan he `customer` nap o
        // dau ham (buoc 5.2), khong dich `customerSlug`.
        const customerSharedUserId = assertUserKeyLoaded(
          databaseEntity.customer?.sharedUserId,
          context,
        );

        // Buoc 7.7b (trend-api.md 7.4(b)): cong xu vao vi shared-user - MOT lenh
        // mang ca dong so cai (objectType/objectId/objectSlug/desc) va tra so du
        // sau khi cong: khong con luot doc-sau-cong, khong con lenh tao dong
        // `point_transaction` rieng. Khoa cardOrderIdempotencyKey(<slug don>, <sharedUserId
        // chu don>). Goi lai `_generateAndRedeem` (BE-16) => `replayed`.
        await this.sharedUserServiceClient.creditBalance({
          userId: customerSharedUserId,
          points: totalAmount,
          transactionId: cardOrderIdempotencyKey(
            databaseEntity.slug,
            customerSharedUserId,
          ),
          objectType: PointTransactionObjectTypeEnum.CARD_ORDER,
          objectId: databaseEntity.id,
          objectSlug: databaseEntity.slug,
          desc: `Nạp cho bản thân ${totalAmount.toLocaleString()} xu`,
        });

        break;
      case CardOrderType.BUY:
        // Just create gift cards
        await this.gcService.bulkGen({
          quantity: databaseEntity.quantity,
          cardSlug: databaseEntity.cardSlug,
          cardOrderSlug: databaseEntity.slug,
        });
        break;
      default:
        break;
    }
  }

  async handlePaymentCompletion(payload: { orderSlug: string }) {
    const context = `${CardOrderService.name}.${this.handlePaymentCompletion.name}`;
    this.logger.log(
      `Update card order ${payload?.orderSlug} status after payment completion req: ${JSON.stringify(payload)}`,
      context,
    );

    const order = await this.cardOrderRepository.findOne({
      where: {
        slug: payload.orderSlug,
      },
      relations: ['payment', 'receipients'],
    });

    if (!order) {
      this.logger.log(`Card order ${payload.orderSlug} not found`, context);
    }

    if (order.status !== CardOrderStatus.PENDING) {
      this.logger.log(`Card order ${order.slug} is not pending`, context);
      return;
    }

    if (order.payment?.statusCode === PaymentStatus.PENDING) {
      this.logger.log(
        `Payment ${order?.payment?.slug} status is pending`,
        context,
      );
      return;
    }

    const sequence = await this.buildSequence();

    Object.assign(order, {
      status:
        order.payment?.statusCode === PaymentStatus.COMPLETED
          ? CardOrderStatus.COMPLETED
          : CardOrderStatus.FAIL,
      paymentStatus: order.payment?.statusCode,
      sequence,
    } as Partial<CardOrder>);

    const updated = await this.transactionService.execute<CardOrder>(
      async (manager) => {
        return await manager.save(order);
      },
      (result) => {
        this.logger.log(
          `Card order ${result.slug} status ${result.status}`,
          context,
        );
      },
      (err) => {
        this.logger.error(
          `Error when updating card order status: ${err.message}`,
          err.stack,
          context,
        );
      },
    );
    await this._generateAndRedeem(updated);
    if (updated.status === CardOrderStatus.COMPLETED) {
      await this.notificationUtils.sendNotificationAfterCardOrderIsPaid(updated);
    }
  }
}
