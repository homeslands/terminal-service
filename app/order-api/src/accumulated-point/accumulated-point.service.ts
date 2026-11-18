import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  FindManyOptions,
  FindOptionsWhere,
  Repository,
  Between,
  In,
} from 'typeorm';
import { AccumulatedPointTransactionHistory } from './entities/accumulated-point-transaction-history.entity';
import { ACCUMULATED_POINT_OBJECT_TYPE_ORDER } from './accumulated-point.constants';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  AccumulatedPointResponseDto,
  IAddPointsDto,
  GetPointHistoryQueryDto,
  PointTransactionHistoryResponseDto,
  ApplyPointsResponseDto,
} from './accumulated-point.dto';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { AccumulatedPointException } from './accumulated-point.exception';
import { AccumulatedPointValidation } from './accumulated-point.validation';
import { isCustomer, validatePointsUsage } from './accumulated-point.utils';
import { User } from 'src/user/user.entity';
// Buoc 2.6: helper nhan dien khach vang lai doi cho (sang `user/`) va doi chu
// ky (nhan BAN GHI, so theo `sharedUserId`) - xem chu thich o noi khai.
import { assertUserKeyLoaded, isDefaultCustomer } from 'src/user/user.constant';
import { Order } from 'src/order/order.entity';
import { ConfigService } from '@nestjs/config';
import { SystemConfigService } from 'src/system-config/system-config.service';
import { SystemConfigKey } from 'src/system-config/system-config.constant';
import { OrderStatus } from 'src/order/order.constants';
import { OrderException } from 'src/order/order.exception';
import { OrderValidation } from 'src/order/order.validation';
import {
  orderOpIdempotencyKey,
  orderRef,
  parseOrderRef,
  SERVICE_PREFIX,
} from 'src/shared/constants/service-ref.constant';
import {
  SharedAccumulatedPointMove,
  SharedUserServiceClient,
} from 'src/external-services/shared-user-service/shared-user-service.client';
import { TErrorCodeValue } from 'src/app/app.validation';

@Injectable()
export class AccumulatedPointService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AccumulatedPointTransactionHistory)
    private readonly transactionHistoryRepository: Repository<AccumulatedPointTransactionHistory>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectMapper()
    private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    private readonly systemConfigService: SystemConfigService,
    // Buoc 7.7d: bon nhip diem + lookup di qua shared-user.
    private readonly sharedUserServiceClient: SharedUserServiceClient,
  ) {}

  async getAccumulatedPointsPercentage() {
    return (
      (await this.systemConfigService.get(
        SystemConfigKey.ACCUMULATED_POINTS_PERCENTAGE,
      )) || '0'
    );
  }

  /**
   * Get points history of user
   */
  async getPointsHistory(
    userSlug: string,
    query: GetPointHistoryQueryDto,
  ): Promise<AppPaginatedResponseDto<PointTransactionHistoryResponseDto>> {
    const context = `${AccumulatedPointService.name}.${this.getPointsHistory.name}`;

    const user = await this.userRepository.findOne({
      where: { slug: userSlug },
      relations: ['accumulatedPoint', 'role'],
    });

    if (!user) {
      this.logger.error(`User not found: ${userSlug}`, context);
      throw new AccumulatedPointException(
        AccumulatedPointValidation.USER_NOT_FOUND,
      );
    }

    // Check if user is customer
    if (!isCustomer(user.role?.name)) {
      this.logger.log(`User is not customer: ${userSlug}`, context);
      throw new AccumulatedPointException(
        AccumulatedPointValidation.CUSTOMER_ONLY_FEATURE,
      );
    }

    // Check if user is default customer
    if (isDefaultCustomer(user)) {
      this.logger.warn(
        `Default customer cannot view points history: ${userSlug}`,
        context,
      );
      throw new AccumulatedPointException(
        AccumulatedPointValidation.DEFAULT_CUSTOMER_NOT_ELIGIBLE,
      );
    }

    if (!user.accumulatedPoint) {
      return {
        hasNext: false,
        hasPrevios: false,
        items: [],
        total: 0,
        page: query.hasPaging ? query.page : 1,
        pageSize: query.hasPaging ? query.size : 0,
        totalPages: 0,
      } as AppPaginatedResponseDto<PointTransactionHistoryResponseDto>;
    }

    // Construct where options
    const whereOptions: FindOptionsWhere<AccumulatedPointTransactionHistory> = {
      accumulatedPoint: {
        id: user.accumulatedPoint.id,
      },
      type: In([query.types]),
    };

    if (query.fromDate && query.toDate) {
      whereOptions.createdAt = Between(
        new Date(query.fromDate),
        new Date(query.toDate),
      );
    } else if (query.fromDate) {
      whereOptions.createdAt = Between(new Date(query.fromDate), new Date());
    } else if (query.toDate) {
      whereOptions.createdAt = Between(
        new Date('1970-01-01'),
        new Date(query.toDate),
      );
    }

    // Construct find many options
    const findManyOptions: FindManyOptions = {
      relations: ['order'],
      where: whereOptions,
      order: { date: 'DESC' },
    };

    if (query.hasPaging) {
      findManyOptions.skip = (query.page - 1) * query.size;
      findManyOptions.take = query.size;
    }

    const [transactions, total] =
      await this.transactionHistoryRepository.findAndCount(findManyOptions);

    // Calculate total pages
    const page = query.hasPaging ? query.page : 1;
    const pageSize = query.hasPaging ? query.size : total;
    const totalPages = Math.ceil(total / pageSize);

    // Determine hasNext and hasPrevious
    const hasNext = page < totalPages;
    const hasPrevious = page > 1;

    // Map to response DTOs
    const items = transactions.map((transaction) => ({
      ...this.mapper.map(
        transaction,
        AccumulatedPointTransactionHistory,
        PointTransactionHistoryResponseDto,
      ),
      orderSlug: transaction.order?.slug,
    }));

    return {
      hasNext,
      hasPrevios: hasPrevious,
      items,
      total,
      page,
      pageSize,
      totalPages,
    } as AppPaginatedResponseDto<PointTransactionHistoryResponseDto>;
  }

  /**
   * Get total points of user
   */
  // Buoc 7.7d (trend-api.md 7.4(d), QD17): route "xem ho" `user/:slug/points`
  // doc so diem tu `/internal/accumulated-points/lookup` (so tieu duoc ngay -
  // giu cho da tru san). Hai kiem cua mono (chi khach, khong phai khach vang
  // lai) o lai terminal. Khong con tao hang diem cuc bo o lan doc dau: bang
  // cuc bo chi-doc tu 7.8, shared-user tra 0 cho nguoi chua co hang.
  async getTotalPointsByUserSlug(
    userSlug: string,
  ): Promise<AccumulatedPointResponseDto> {
    const context = `${AccumulatedPointService.name}.${this.getTotalPointsByUserSlug.name}`;

    const user = await this.userRepository.findOne({
      where: { slug: userSlug },
      relations: ['role'],
    });

    if (!user) {
      this.logger.error(`User not found: ${userSlug}`, context);
      throw new AccumulatedPointException(
        AccumulatedPointValidation.USER_NOT_FOUND,
      );
    }

    // Check if user is customer
    if (!isCustomer(user.role?.name)) {
      this.logger.log(`User is not customer: ${userSlug}`, context);
      throw new AccumulatedPointException(
        AccumulatedPointValidation.CUSTOMER_ONLY_FEATURE,
      );
    }

    // Check if user is default customer
    if (isDefaultCustomer(user)) {
      this.logger.warn(
        `Default customer cannot accumulate points: ${userSlug}`,
        context,
      );
      throw new AccumulatedPointException(
        AccumulatedPointValidation.DEFAULT_CUSTOMER_NOT_ELIGIBLE,
      );
    }

    const points = await this.sharedUserServiceClient.lookupAccumulatedPoints(
      assertUserKeyLoaded(user.sharedUserId, context),
    );
    if (points === null) {
      this.logger.error(
        `User ${userSlug} (sharedUserId ${user.sharedUserId}) not found at shared-user`,
        context,
      );
      throw new AccumulatedPointException(
        AccumulatedPointValidation.USER_NOT_FOUND,
      );
    }

    return Object.assign(new AccumulatedPointResponseDto(), {
      totalPoints: points,
    });
  }

  /**
   * Add points for user after successful payment
   */
  // Buoc 7.7d (trend-api.md 7.4(d), QD-T4): `/internal/accumulated-points/add`
  // voi khoa `orderOpIdempotencyKey(<slug don>, 'add')` - job chay lai thi vi
  // nuot lenh thu hai (`replayed`). So diem do BEN GOI tinh san bang ti le cua
  // terminal (`system_config` rieng tung service); shared-user khong nhan ti le.
  // Phan quyet dinh (chi khach, khong phai khach vang lai) o lai day. Loi nem
  // ra cho job (QD8: job chi log, don van PAID).
  async addPointsForOrder(addPointsDto: IAddPointsDto): Promise<void> {
    const context = `${AccumulatedPointService.name}.${this.addPointsForOrder.name}`;

    // Tra theo `sharedUserId` (buoc 2.14 — 2C, muc 1.10), KHONG theo id cuc bo.
    //
    // `assertUserKeyLoaded` la bat buoc o day, khong phai de cho dep: neu khoa
    // la `undefined` thi `findOne({ where: { sharedUserId: undefined } })` lam
    // TypeORM **bo han dieu kien** va tra **HANG DAU BANG** - tuc cong diem cho
    // mot nguoi la. Phep gac `!user` ngay duoi **khong** chan duoc truong hop
    // do (no tra ve mot hang hop le). Lop loi nay da xay ra that hai lan: buoc
    // 2.3 (`findOneByField`) va buoc 2.4 (`lookup` the).
    const user = await this.userRepository.findOne({
      where: {
        sharedUserId: assertUserKeyLoaded(addPointsDto.sharedUserId, context),
      },
      relations: ['role'],
    });

    if (!user) {
      this.logger.error(
        `User not found: ${addPointsDto.sharedUserId}`,
        context,
      );
      throw new AccumulatedPointException(
        AccumulatedPointValidation.USER_NOT_FOUND,
      );
    }

    // Check if user is customer
    if (!isCustomer(user.role?.name)) {
      this.logger.log(
        `User is not customer: ${addPointsDto.sharedUserId}`,
        context,
      );
      return; // Don't add points for non-customer
    }

    // Check if user is default customer
    if (isDefaultCustomer(user)) {
      this.logger.log(
        `Default customer skipped for points accumulation: ${addPointsDto.sharedUserId}`,
        context,
      );
      return; // Don't add points for default customer
    }

    // shared-user chi nhan so nguyen >= 1.
    if (!(addPointsDto.points >= 1)) {
      this.logger.log(
        `No points to add for order ${addPointsDto.orderSlug} (${addPointsDto.points})`,
        context,
      );
      return;
    }

    const key = orderOpIdempotencyKey(addPointsDto.orderSlug, 'add');
    try {
      const move = await this.sharedUserServiceClient.addAccumulatedPoints({
        userId: user.sharedUserId,
        points: addPointsDto.points,
        transactionId: key,
        objectType: ACCUMULATED_POINT_OBJECT_TYPE_ORDER,
        objectId: addPointsDto.orderId,
        objectSlug: addPointsDto.orderSlug,
        pointsPercentage: addPointsDto.pointsPercentage,
      });
      this.logger.log(
        `Added ${move.points} points for ${user.sharedUserId}, order ${addPointsDto.orderSlug} (key ${key}${move.replayed ? ', replayed' : ''}). Current: ${move.totalPoints}`,
        context,
      );
    } catch (error) {
      throw this.toPointsError(
        error,
        `add ${addPointsDto.points} points (key ${key})`,
        AccumulatedPointValidation.ERROR_UPDATING_POINTS,
        context,
      );
    }
  }

  /**
   * Reserve points when apply for order (not actually subtract points)
   */
  /**
   * Gac tien to cua tham chieu don (buoc 2.15 — 2C).
   *
   * `parseOrderRef` **co y khong tu quyet dinh** khi tien to la cua service
   * khac - no chi tra `service` ra cho ben goi chot. Day la cho chot do, gom
   * mot lan cho ca bon ham.
   *
   * NEM chu khong `return` em. Bon ham diem tra don tren `terminal_db` theo
   * `order: { slug }`, nen mot ref cua service khac - hoac mot slug tran quen
   * boc `orderRef()` - khong khop hang nao, va
   * `handleCancelReservation` thi **`return` em** khi khong thay reservation
   * ⇒ loi se bien thanh "khong lam gi ca": giu cho diem khong bao gio duoc
   * nha, khong mot dong log nao noi vi sao. Ke hoach goi dung hinh dang nay la
   * **nguon loi so mot** cua buoc 2.15.
   *
   * Khach khong gui duoc ref (hai route client-facing nhan `slug` roi tu boc
   * `orderRef(slug)`), nen den day la ma noi bo truyen sai ⇒ giu mot dong
   * `logger.error` de con duong lan ra, va nem ma co san 159011 thay vi
   * `Error` tran (bai hoc buoc 2.13: khong co filter catch-all nao bat `Error`,
   * no thanh 500 khong ma loi).
   */
  private assertLocalOrderRef(
    service: string | null,
    ref: string,
    context: string,
  ): void {
    if (service === SERVICE_PREFIX) return;

    this.logger.error(
      `${context}: order reference "${ref}" does not belong to this service ` +
        `(expected prefix "${SERVICE_PREFIX}", got ${service === null ? 'no prefix' : `"${service}"`}). ` +
        `No client can send a reference - the two client-facing routes wrap orderRef(slug) themselves - ` +
        `so this is a bug in the calling code. Throwing 159011 ORDER_NOT_FOUND instead of looking up a ` +
        `slug that cannot match and returning silently.`,
      context,
    );
    throw new AccumulatedPointException(
      AccumulatedPointValidation.ORDER_NOT_FOUND,
    );
  }

  /**
   * Buoc 7.7d: giu cho dang MO cua don = khoa luu tren don
   * (`pointsReservationKey`) + so diem dang ap (`accumulatedPointsToUse > 0`).
   *
   * Khoa KHONG bi xoa khi huy: sau chu `handleCancelReservation` moi cho goi
   * deu dat `accumulatedPointsToUse = 0` roi `save(order)` bang ban trong bo
   * nho - xoa khoa trong DB o day thi lenh `save` do ghi lai khoa cu. Nen
   * "da dong" doc tu so diem, khoa chi la dia chi cua lan giu cuoi.
   *
   * Tra `null` khi khong co giu cho mo. Giu cho tao TRUOC cutover (backfill
   * 6.12 chep sang vi khong kem khoa) thi co so diem ma khong co khoa: khong
   * xac nhan / huy duoc qua 6.7 (chi nhan khoa) - log loi kem slug de dong
   * bang tay (7.8 dong cac giu cho nay truoc khi dong bang), tra `null`.
   */
  private openReservationKeyOf(order: Order, context: string): string | null {
    if (!(order.accumulatedPointsToUse > 0)) return null;
    if (order.pointsReservationKey) return order.pointsReservationKey;
    this.logger.error(
      `Order ${order.slug} uses ${order.accumulatedPointsToUse} points but has no reservation key ` +
        `(reserved before the wallet cutover). shared-user confirms / cancels a reservation by its key ` +
        `only - close this reservation by hand (step 7.8 closes them before the freeze).`,
      context,
    );
    return null;
  }

  /**
   * 4xx cua route diem shared-user mang ma nghiep vu 159xxx (bang ma port tu
   * mono, cung so voi `AccumulatedPointValidation`) => nem lai
   * `AccumulatedPointException` cung ma de UI dich duoc. 4xx ma la (validation,
   * 404, 409) => log kem viec dang lam, nem `fallback` (thay cho 500 tran cua
   * loi axios - `HttpExceptionFilter` chi bat `HttpException`). 503 (`postMoney`
   * hong hai lan) va loi khac tra nguyen. Ben goi `throw` ket qua.
   */
  private toPointsError(
    error: unknown,
    doing: string,
    fallback: TErrorCodeValue,
    context: string,
  ): unknown {
    const response = (
      error as {
        response?: {
          status?: number;
          data?: { statusCode?: number; message?: string };
        };
      }
    )?.response;
    const status = response?.status;
    if (status === undefined || status >= 500) return error;
    const code = response?.data?.statusCode;
    const known = Object.values(AccumulatedPointValidation).find(
      (value) => value.code === code,
    );
    this.logger.warn(
      `shared-user refused to ${doing}: status=${status} code=${code ?? '-'} ${response?.data?.message ?? ''}`,
      context,
    );
    return new AccumulatedPointException(known ?? fallback);
  }

  /**
   * Nhan `orderSlug` tu route, KHONG nhan tham chieu co tien to (chot
   * 10/11/2026).
   *
   * Hai ham duoc controller goi (`reservePointsForOrder`, `cancelReservation`)
   * nhan **slug tran**: controller la bien VAO, no noi ngon ngu client. Truoc
   * do controller phai `orderRef(slug)` roi ham nay **boc nguoc lai ngay** de
   * tra cuc bo - boc/bo trong cung mot request. Viec dung tham chieu la viec
   * cua service, va service tu lam: xem `cancelReservation` goi
   * `orderRef(orderSlug)` khi chuyen tiep xuong `handleCancelReservation`.
   *
   * Hai ham con lai (`confirmPointsUsage`, `handleCancelReservation`) van nhan
   * **tham chieu** vi chung duoc goi tu NGOAI module (job, order, order-item).
   */
  // Buoc 7.7d (trend-api.md 7.4(d)): `/internal/accumulated-points/reserve`.
  // Moi lan giu mot khoa MOI `orderOpIdempotencyKey(<slug>, 'reserve', <seq>)`,
  // seq = `Date.now()` (chot nguon cua `reservationSeq` - 5.5 de lai cho 7.4):
  // tang dan, khong can doc lai lan giu truoc, va khong trung khoa cua mot giu
  // cho DA DONG (vi tra 409 cho khoa do). Giu lai cung don bang khoa moi thi vi
  // tu thay giu cho cu trong mot transaction. Khoa luu tren don de job xac nhan
  // va cac cho huy dung lai. Kiem "mot nguoi mot giu cho" la viec cua vi
  // (400/159016). Phan quyet dinh (don PENDING, chu don la khach, khong phai
  // khach vang lai) o lai day.
  async reservePointsForOrder(
    orderSlug: string,
    pointsToUse: number,
    createdUserId: string,
  ): Promise<ApplyPointsResponseDto> {
    const context = `${AccumulatedPointService.name}.${this.reservePointsForOrder.name}`;

    const createdUser = await this.userRepository.findOne({
      where: { id: createdUserId },
    });

    if (!createdUser) {
      this.logger.error(
        `Created user for apply accumulated points not found: ${createdUserId}`,
        context,
      );
      throw new AccumulatedPointException(
        AccumulatedPointValidation.USER_NOT_FOUND,
      );
    }

    const order = await this.orderRepository.findOne({
      where: { slug: orderSlug },
      relations: ['owner.role'],
    });

    if (!order) {
      this.logger.error(`Order not found: ${orderSlug}`, context);
      throw new AccumulatedPointException(
        AccumulatedPointValidation.ORDER_NOT_FOUND,
      );
    }

    if (order.status !== OrderStatus.PENDING) {
      this.logger.error(`Order is not pending: ${orderSlug}`, context);
      throw new AccumulatedPointException(
        AccumulatedPointValidation.ORDER_STATUS_INVALID,
      );
    }

    const user = order.owner;
    if (!user) {
      this.logger.error(`Order owner not found: ${orderSlug}`, context);
      throw new AccumulatedPointException(
        AccumulatedPointValidation.ORDER_OWNER_NOT_FOUND,
      );
    }

    // Check if user is customer
    if (!isCustomer(user.role?.name)) {
      this.logger.log(`User is not customer: ${user.id}`, context);
      throw new AccumulatedPointException(
        AccumulatedPointValidation.CUSTOMER_ONLY_FEATURE,
      );
    }

    // Check if user is default customer
    if (isDefaultCustomer(user)) {
      this.logger.warn(
        `Default customer cannot use points: ${orderSlug}`,
        context,
      );
      throw new AccumulatedPointException(
        AccumulatedPointValidation.DEFAULT_CUSTOMER_NOT_ELIGIBLE,
      );
    }

    const sharedUserId = assertUserKeyLoaded(user.sharedUserId, context);
    const availablePoints =
      await this.sharedUserServiceClient.lookupAccumulatedPoints(sharedUserId);
    if (availablePoints === null) {
      this.logger.error(
        `Order owner ${sharedUserId} not found at shared-user: ${orderSlug}`,
        context,
      );
      throw new AccumulatedPointException(
        AccumulatedPointValidation.USER_NOT_FOUND,
      );
    }

    // Giu cho dang mo cua CHINH don nay: vi da tru no khoi so tieu duoc, va
    // lan giu moi se thay no => cong lai khi kiem (nhu mono).
    const oldPointsToUse = this.openReservationKeyOf(order, context)
      ? order.accumulatedPointsToUse
      : 0;

    // Validate points usage
    const validation = validatePointsUsage(
      pointsToUse,
      availablePoints + oldPointsToUse,
      order.subtotal + oldPointsToUse,
    );
    if (!validation.isValid) {
      this.logger.warn(`Invalid points usage: ${validation.error}`, context);
      throw new AccumulatedPointException(
        AccumulatedPointValidation.INVALID_POINTS_AMOUNT,
      );
    }

    const key = orderOpIdempotencyKey(order.slug, 'reserve', Date.now());
    let move: SharedAccumulatedPointMove;
    try {
      move = await this.sharedUserServiceClient.reserveAccumulatedPoints({
        userId: sharedUserId,
        points: pointsToUse,
        transactionId: key,
        objectType: ACCUMULATED_POINT_OBJECT_TYPE_ORDER,
        objectId: order.id,
        objectSlug: order.slug,
      });
    } catch (error) {
      throw this.toPointsError(
        error,
        `reserve ${pointsToUse} points for order ${orderSlug} (key ${key})`,
        AccumulatedPointValidation.ERROR_CREATING_TRANSACTION_HISTORY,
        context,
      );
    }

    const finalAmount = order.subtotal + oldPointsToUse - pointsToUse;
    order.accumulatedPointsToUse = pointsToUse;
    order.subtotal = finalAmount;
    order.pointsReservationKey = key;
    try {
      await this.orderRepository.save(order);
    } catch (error) {
      // Vi da giu ma don khong ghi duoc khoa => khong ai xac nhan / huy duoc
      // giu cho nay (no chan lan giu sau cua chinh khach toi khi het han).
      // Tra lai ngay; hong nua thi de het han (QD11) lo.
      this.logger.error(
        `Error saving order ${orderSlug} after reserving ${pointsToUse} points (key ${key}): ${error.message} - cancelling the reservation`,
        error.stack,
        context,
      );
      await this.sharedUserServiceClient
        .cancelAccumulatedPointsReservation(key)
        .catch((cancelError) =>
          this.logger.error(
            `Cancelling reservation ${key} of order ${orderSlug} failed too: ${cancelError?.message} - it is released when it expires`,
            context,
          ),
        );
      throw new AccumulatedPointException(
        AccumulatedPointValidation.ERROR_CREATING_TRANSACTION_HISTORY,
      );
    }

    this.logger.log(
      `Reserved ${pointsToUse} points for ${sharedUserId}, order ${orderSlug} (key ${key}${move.replayed ? ', replayed' : ''}). Current points: ${move.totalPoints}`,
      context,
    );

    return {
      pointsUsed: pointsToUse,
      finalAmount,
    };
  }

  /**
   * Confirm points usage when order is paid successfully
   */
  // Buoc 7.7d (trend-api.md 7.4(d)): `/internal/accumulated-points/confirm` voi
  // KHOA CUA LAN GIU (vi ghi `<khoa>:confirm`, xac nhan hai lan = mot lan). QD7:
  // loi nem ra de job KHONG chot don (job tra xu Z-7 neu da tru, don PENDING).
  // 409 = giu cho khong con mo (da huy, het han QD11) - cung nem: chot don ma
  // diem da tra lai la khach duoc giam khong mat diem.
  async confirmPointsUsage(ref: string): Promise<void> {
    const context = `${AccumulatedPointService.name}.${this.confirmPointsUsage.name}`;

    // Buoc 2.15 — 2C: nhan `terminal:<orderSlug>` thay cho `order.id` cuc bo.
    const { service, orderSlug } = parseOrderRef(ref);
    this.assertLocalOrderRef(service, ref, context);

    const order = await this.orderRepository.findOne({
      where: { slug: orderSlug },
    });
    const key = order ? this.openReservationKeyOf(order, context) : null;
    if (!key) {
      this.logger.log(
        `No reserved points found for order ${orderSlug} (ref ${ref})`,
        context,
      );
      return; // No points to reserve, skip
    }

    let move: SharedAccumulatedPointMove;
    try {
      move =
        await this.sharedUserServiceClient.confirmAccumulatedPointsReservation(
          key,
        );
    } catch (error) {
      throw this.toPointsError(
        error,
        `confirm reservation ${key} of order ${orderSlug}`,
        AccumulatedPointValidation.ERROR_UPDATING_POINTS,
        context,
      );
    }

    this.logger.log(
      `Confirmed ${move.points} points usage for order ${orderSlug} (key ${move.transactionId}${move.replayed ? ', replayed' : ''}). New balance: ${move.totalPoints}`,
      context,
    );
  }

  /**
   * Cancel reservation if exists, refund points if confirmed
   */
  /** Nhan `orderSlug` tu route - xem chu thich o `reservePointsForOrder`. */
  async cancelReservation(
    orderSlug: string,
    createdUserId: string,
  ): Promise<void> {
    const context = `${AccumulatedPointService.name}.${this.handleCancelReservation.name}`;

    const order = await this.orderRepository.findOne({
      where: { slug: orderSlug },
    });

    if (!order) {
      this.logger.log(`Order not found: ${orderSlug}`, context);
      throw new OrderException(OrderValidation.ORDER_NOT_FOUND);
    }

    // Buoc 2.15 — 2C: `handleCancelReservation` nhan **tham chieu** (no con
    // sau cho goi khac tu ngoai module), nen SERVICE dung ref o day - khong de
    // controller lam viec do.
    await this.handleCancelReservation(orderRef(orderSlug), createdUserId);
    // Update subtotal and accumulated points to use in order
    const subtotalBeforeUseAccumulatedPoints =
      order.subtotal + order.accumulatedPointsToUse;
    order.accumulatedPointsToUse = 0;
    order.subtotal = subtotalBeforeUseAccumulatedPoints;

    await this.orderRepository.save(order);
  }

  /**
   * Automatically handle when order is cancelled or expired
   * Cancel reservation if exists, refund points if confirmed
   */
  // Buoc 7.7d (trend-api.md 7.4(d)): `/internal/accumulated-points/cancel-reservation`
  // voi khoa cua lan giu (vi ghi `<khoa>:cancel`; huy hai lan = mot lan, nen
  // moi cho goi lai deu vo hai). Ham nay KHONG ghi don: moi cho goi tu dat
  // `accumulatedPointsToUse = 0` roi luu don (xem `openReservationKeyOf`).
  // 409 = giu cho da duoc xac nhan (don da tra) => khong con gi de tra, nhu
  // mono (khong thay RESERVE/PENDING thi `return`). 404 = khoa chua tung ghi
  // => cung khong co gi de tra. Loi khac (503) nem ra cho ben goi.
  async handleCancelReservation(
    ref: string,
    createdUserId?: string | null,
  ): Promise<void> {
    const context = `${AccumulatedPointService.name}.${this.handleCancelReservation.name}`;

    // Buoc 2.15 — 2C: nhan `terminal:<orderSlug>` thay cho `order.id` cuc bo.
    const { service, orderSlug } = parseOrderRef(ref);
    this.assertLocalOrderRef(service, ref, context);

    // Ba duong `return` em ben duoi la duong "khong co giu cho mo": khong co
    // don, don khong ap diem, hoac giu cho cu khong khoa (da log loi o
    // `openReservationKeyOf`). Mot ref sai thi da hong ON AO o phep gac tien to
    // phia tren, khong roi vao day.
    const order = await this.orderRepository.findOne({
      where: { slug: orderSlug },
    });
    const key = order ? this.openReservationKeyOf(order, context) : null;
    if (!key) {
      this.logger.log(
        `No reserved points found for order ${orderSlug} (ref ${ref})`,
        context,
      );
      return; // No points to reserve, skip
    }

    let move: SharedAccumulatedPointMove;
    try {
      move =
        await this.sharedUserServiceClient.cancelAccumulatedPointsReservation(
          key,
        );
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      if (status === 404 || status === 409) {
        this.logger.warn(
          `Reservation ${key} of order ${orderSlug} is not open (shared-user ${status}) - nothing to give back`,
          context,
        );
        return;
      }
      throw this.toPointsError(
        error,
        `cancel reservation ${key} of order ${orderSlug}`,
        AccumulatedPointValidation.ERROR_UPDATING_POINTS,
        context,
      );
    }

    this.logger.log(
      `Refunded ${move.points} reserved points for cancelled/expired order ${orderSlug} (key ${move.transactionId}${move.replayed ? ', replayed' : ''}, by ${createdUserId ?? 'system'})`,
      context,
    );
  }
}
