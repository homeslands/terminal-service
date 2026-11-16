import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { GiftCard } from './entities/gift-card.entity';
import { Between, FindOptionsWhere, MoreThan, Repository } from 'typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { GiftCardException } from './gift-card.exception';
import { GiftCardValidation } from './gift-card.validation';
import { UseGiftCardDto } from './dto/use-gift-card.dto';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { GiftCardStatus } from './gift-card.enum';
import { Card } from '../card/entities/card.entity';
import { CardException } from '../card/card.exception';
import { CardValidation } from '../card/card.validation';
import { GiftCardUtil } from './gift-card.utill';
import { CardOrder } from '../card-order/entities/card-order.entity';
import { CardOrderException } from '../card-order/card-order.exception';
import { CardOrderValidation } from '../card-order/card-order.validation';
import { GenGiftCardDto } from './dto/gen-gift-card.dto';
import { GiftCardResponseDto } from './dto/gift-card-response.dto';
import { CreateGiftCardDto } from './dto/create-gift-card.dto';
import { User } from 'src/user/user.entity';
import {
  PointTransactionObjectTypeEnum,
  PointTransactionTypeEnum,
} from '../point-transaction/entities/point-transaction.enum';
import moment from 'moment';
import { AuthException } from 'src/auth/auth.exception';
import { AuthValidation } from 'src/auth/auth.validation';
import { SharedBalanceService } from 'src/shared/services/shared-balance.service';
import { SharedPointTransactionService } from 'src/shared/services/shared-point-transaction.service';
import { CreatePointTransactionPayload } from 'src/shared/interfaces/commons/shared-point-transaction.interface';
import { FindAllGiftCardDto } from './dto/find-all-gift-card.dto';
import { createSortOptions } from 'src/shared/utils/obj.util';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { CoinPolicy } from '../coin-policy/entities/coin-policy.entity';
import { CoinPolicyKeyEnum } from '../coin-policy/coin-policy.enum';
import { CoinPolicyException } from '../coin-policy/coin-policy.exception';
import { CoinPolicyValidation } from '../coin-policy/coin-policy.validation';
import { assertUserKeyLoaded } from 'src/user/user.constant';
import {
  applyNestedUserFlags,
  assignNestedUserFlags,
  batchLookupSharedUserIdentities,
} from 'src/user/user.helper';
import { SharedUserServiceClient } from 'src/external-services/shared-user-service/shared-user-service.client';

@Injectable()
export class GiftCardService {
  private readonly EXPIRES_DATE = 6; // expires end of the day 6 months later

  /**
   *
   */
  constructor(
    @InjectRepository(GiftCard)
    private readonly gcRepository: Repository<GiftCard>,
    @InjectRepository(Card)
    private readonly cardRepository: Repository<Card>,
    @InjectRepository(CardOrder)
    private readonly coRepository: Repository<CardOrder>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CoinPolicy)
    private coinPolicyRepository: Repository<CoinPolicy>,
    @InjectMapper()
    private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    private readonly transactionService: TransactionManagerService,
    // private readonly balanceService: BalanceService,
    // private readonly ptService: PointTransactionService,
    private readonly balanceService: SharedBalanceService,
    private readonly ptService: SharedPointTransactionService,
    // Buoc 3.4 - `usedBy.isActive` lay tu shared-user (applyNestedUserFlags).
    private readonly sharedUserServiceClient: SharedUserServiceClient,
  ) { }

  async use(req: UseGiftCardDto) {
    const context = `${GiftCardService.name}.${this.use.name}`;

    // Buoc 3.4 - tra `isActive` cua nguoi nhan TRUOC moi lenh ghi (`redeem`
    // luu the, roi cong so du, tao giao dich diem): shared-user hong thi 503
    // ngay day, khi chua ghi gi. Tra SAU thi client nhan 503 cho mot the DA
    // dung. `redeem` tu tim lai user va nem USER_NOT_FOUND - o day chi can
    // `sharedUserId`; khong thay user thi khong goi shared-user.
    const recipient = await this.userRepository.findOne({
      where: { slug: req.userSlug },
    });
    const recipientIdentityById = await batchLookupSharedUserIdentities(
      [recipient?.sharedUserId],
      this.sharedUserServiceClient,
      this.logger,
      context,
    );

    // 2. Auto-redeem
    const gc = await this.redeem(req);

    // C3 — MOT nguon khoa cho ca ba lenh (buoc 2.12/2.13 — 2C).
    //
    // Ban cu dung HAI cach viet cho CUNG mot nguoi: lenh cong doc
    // `gc.usedBySlug`, lenh doc lai doc `req.userSlug`. Khong phai loi hanh vi
    // - `redeem()` tra `user` theo chinh `payload.userSlug` roi gan
    // `usedBySlug = user.slug` - nhung hai cach viet cho cung mot gia tri la
    // thu se thanh loi that khi co nguoi sua mot ben.
    //
    // `gc.usedBy` la chinh ban ghi `user` ma `redeem()` da tra (no gan
    // `usedBy: user` truoc khi luu). `assertUserKeyLoaded` o day de neu mot
    // ngay `manager.save()` khong con giu quan he do thi hong ON AO, thay vi
    // cong xu cho khong ai.
    const sharedUserId = assertUserKeyLoaded(gc.usedBy?.sharedUserId, context);

    // Update recipient balance ONCE after all cards
    await this.balanceService.calcBalance({
      sharedUserId,
      points: gc.cardPoints,
      type: PointTransactionTypeEnum.IN,
    });

    const currentBalance = await this.balanceService.findOneByField({ sharedUserId, slug: null })

    // Create transaction record
    await this.ptService.create({
      type: PointTransactionTypeEnum.IN,
      desc: `Sử dụng thẻ quà tặng ${gc.cardPoints.toLocaleString()} xu`,
      objectType: PointTransactionObjectTypeEnum.GIFT_CARD,
      objectSlug: gc.slug,
      points: gc.cardPoints,
      sharedUserId,
      balance: currentBalance.points
    } satisfies CreatePointTransactionPayload);


    const response = this.mapper.map(gc, GiftCard, GiftCardResponseDto);
    assignNestedUserFlags(
      [[gc.usedBy, response.usedBy]],
      recipientIdentityById,
    );
    return response;
  }

  async findOne(slug: string) {
    const gc = await this.gcRepository.findOne({
      where: {
        slug,
      },
      relations: ['cardOrder.card'],
    });
    if (!gc)
      throw new GiftCardException(GiftCardValidation.GIFT_CARD_NOT_FOUND);

    return this.mapper.map(gc, GiftCard, GiftCardResponseDto);
  }

  buildFindOptionsWhere(req: FindAllGiftCardDto): FindOptionsWhere<GiftCard>[] | FindOptionsWhere<GiftCard> {
    const baseConditions: Partial<FindOptionsWhere<GiftCard>> = {};

    if (req.status) {
      baseConditions.status = req.status;
    }

    if (req.fromDate && !req.toDate) {
      baseConditions.createdAt = MoreThan(req.fromDate);
    }

    if (req.fromDate && req.toDate) {
      baseConditions.createdAt = Between(req.fromDate, req.toDate);
    }

    if (req.customerSlug) {
      return [
        // { ...baseConditions, usedBySlug: req.customerSlug },
        { ...baseConditions, cardOrder: { customerSlug: req.customerSlug } },
      ];
    }

    return baseConditions;
  }

  async findAll(req: FindAllGiftCardDto) {
    const context = `${GiftCardService.name}.${this.findAll.name}`;
    this.logger.log(`Find all gift card req: ${JSON.stringify(req)}`, context);

    const findOptionsWhere = this.buildFindOptionsWhere(req);

    const sortOpts = createSortOptions<GiftCard>(req.sort);

    const [gcs, total] = await this.gcRepository.findAndCount({
      where: findOptionsWhere,
      order: sortOpts,
      take: req.size,
      skip: (req.page - 1) * req.size,
      relations: ['usedBy', 'cardOrder'],
    });

    const gcsResponse = this.mapper.mapArray(
      gcs,
      GiftCard,
      GiftCardResponseDto,
    );
    await applyNestedUserFlags(
      gcs.map((gc, index) => [gc.usedBy, gcsResponse[index]?.usedBy] as const),
      this.sharedUserServiceClient,
      this.logger,
      context,
    );

    // Calculate total pages
    const totalPages = Math.ceil(total / req.size);
    // Determine hasNext and hasPrevious
    const hasNext = req.page < totalPages;
    const hasPrevious = req.page > 1;

    return {
      hasNext: hasNext,
      hasPrevios: hasPrevious,
      items: gcsResponse,
      total,
      page: req.page,
      pageSize: req.size,
      totalPages,
    } as AppPaginatedResponseDto<GiftCardResponseDto>;
  }

  async redeem(payload: UseGiftCardDto) {
    const context = `${GiftCardService.name}.${this.redeem.name}`;
    this.logger.log(`Use gift card ${JSON.stringify(payload)}`, context);

    const policy = await this.coinPolicyRepository.findOne({
      where: {
        key: CoinPolicyKeyEnum.MAX_BALANCE
      }
    })

    const user = await this.userRepository.findOne({
      where: {
        slug: payload.userSlug,
      },
    });
    if (!user) throw new AuthException(AuthValidation.USER_NOT_FOUND);

    // C3 — MOT nguon khoa (buoc 2.12/2.13 — 2C). Buoc 5.2: lay khoa vi cua
    // nguoi dung the ngay day, qua `assertUserKeyLoaded`, de phep doc so du cua
    // luat tran cung di qua no (truoc doc thang `user.sharedUserId`). Thieu
    // khoa ⇒ hong ON AO (400 / 137000) truoc moi lenh ghi. Ba lenh vi o `use()`
    // xung bang `gc.usedBy` - chinh ban ghi `user` nay (C3).
    const sharedUserId = assertUserKeyLoaded(user.sharedUserId, context);

    // GIU NGUYEN LOI GOC - BE-7 (`progress/loi-co-tu-truoc.md`, nguoi dung chot
    // 17/11/2026, sua gop sau giai doan 10): doc the -> kiem `status` ->
    // `save(USED)` khong khoa hang, `use()` cong xu sau khi ham nay tra ve ⇒
    // hai request cung mot the cung luc cung qua phep kiem roi cung duoc cong.
    const gc = await this.gcRepository.findOne({
      where: {
        code: payload.code,
        serial: payload.serial,
      },
    });
    if (!gc)
      throw new GiftCardException(GiftCardValidation.GIFT_CARD_NOT_FOUND);

    if (policy?.isActive) {
      const balance = await this.balanceService.findOneByField({ sharedUserId, slug: null });
      const newBalance = balance.points + gc.cardPoints;
      const maxBalance = +policy.value;
      if (newBalance > maxBalance)
        throw new CoinPolicyException(CoinPolicyValidation.EXCEED_MAXIMUM_BALANCE);
    }

    if (gc.status === GiftCardStatus.USED)
      throw new GiftCardException(GiftCardValidation.GC_USED);

    if (gc.status === GiftCardStatus.EXPIRED)
      throw new GiftCardException(GiftCardValidation.GC_EXPIRED);

    Object.assign(gc, {
      usedAt: moment().toDate(),
      usedById: user.id,
      usedBySlug: user.slug,
      usedBy: user,
      status: GiftCardStatus.USED,
    } as Partial<GiftCard>);

    // TODO: Need checksum before updating status

    return await this.transactionService.execute<GiftCard>(
      async (manager) => {
        return await manager.save(gc);
      },
      (result) =>
        this.logger.log(`Use gift card success ${result?.slug}`, context),
      (error) => {
        this.logger.error(
          `Error when using gift card: ${error.message}`,
          error.stack,
          context,
        );
        throw new GiftCardException(
          GiftCardValidation.ERROR_WHEN_USE_GIFT_CARD,
        );
      },
    );
  }

  async gen(payload: CreateGiftCardDto) {
    const context = `${GiftCardService.name}.${this.gen.name}`;
    this.logger.log(`Gen gift card req: ${JSON.stringify(payload)}`, context);

    const card = await this.cardRepository.findOne({
      where: {
        slug: payload.cardSlug,
      },
    });

    if (!card) throw new CardException(CardValidation.CARD_NOT_FOUND);

    if (!card.isActive)
      throw new CardException(CardValidation.CARD_IS_NOT_ACTIVE);

    const co = await this.coRepository.findOne({
      where: {
        slug: payload.cardOrderSlug,
      },
    });
    if (!co)
      throw new CardOrderException(CardOrderValidation.CARD_ORDER_NOT_FOUND);

    const gc = this.buildGiftCard(co, card);

    return await this.transactionService.execute<GiftCard>(
      async (manager) => {
        return await manager.save(manager.create(GiftCard, gc));
      },
      (result) =>
        this.logger.log(
          `Gen gift card success: ${JSON.stringify(result)}`,
          context,
        ),
      (error) => {
        this.logger.error(
          `Error when gen gift card: ${error.message}`,
          error.stack,
          context,
        );
        throw new GiftCardException(
          GiftCardValidation.ERROR_WHEN_GEN_GIFT_CARD,
        );
      },
    );
  }

  async bulkGen(payload: GenGiftCardDto) {
    const context = `${GiftCardService.name}.${this.bulkGen.name}`;
    this.logger.log(
      `Bulk gen gift card req: ${JSON.stringify(payload)}`,
      context,
    );

    const card = await this.cardRepository.findOne({
      where: {
        slug: payload.cardSlug,
      },
    });

    if (!card) throw new CardException(CardValidation.CARD_NOT_FOUND);

    if (!card.isActive)
      throw new CardException(CardValidation.CARD_IS_NOT_ACTIVE);

    const co = await this.coRepository.findOne({
      where: {
        slug: payload.cardOrderSlug,
      },
    });
    if (!co)
      throw new CardOrderException(CardOrderValidation.CARD_ORDER_NOT_FOUND);

    const gcs = [...Array(payload.quantity)].map(() =>
      this.buildGiftCard(co, card),
    );

    return await this.transactionService.execute<GiftCard[]>(
      async (manager) => {
        return await manager.save(gcs);
      },
      (result) =>
        this.logger.log(
          `Gen gift cards success: ${result.map((item) => item?.slug).join(', ')}`,
          context,
        ),
      (error) => {
        this.logger.error(
          `Error when gen gift cards: ${error.message}`,
          error.stack,
          context,
        );
        throw new GiftCardException(
          GiftCardValidation.ERROR_WHEN_GEN_GIFT_CARD,
        );
      },
    );
  }

  private buildGiftCard(co: CardOrder, card: Card) {
    const gc = new GiftCard();

    // TODO: Hash gc code before saving

    Object.assign(gc, {
      cardName: card.title,
      cardPoints: card.points,
      serial: GiftCardUtil.generateSerial(),
      code: GiftCardUtil.generateRechargeCode(),
      expiredAt: GiftCardUtil.calcExpirationDate(this.EXPIRES_DATE),
      cardOrderId: co.id,
      cardOrderSlug: co.slug,
      cardOrder: co,
    } as Partial<GiftCard>);
    return gc;
  }
}
