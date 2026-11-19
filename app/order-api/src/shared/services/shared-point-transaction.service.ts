import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { Order } from 'src/order/order.entity';
import { User } from 'src/user/user.entity';
import { assertUserKeyLoaded } from 'src/user/user.constant';
import { CreatePointTransactionPayload } from 'src/shared/interfaces/commons/shared-point-transaction.interface';
import { PointTransaction } from 'src/gift-card-modules/point-transaction/entities/point-transaction.entity';
import { GiftCard } from 'src/gift-card-modules/gift-card/entities/gift-card.entity';
import {
  PointTransactionObjectTypeEnum,
  PointTransactionTypeEnum,
} from 'src/gift-card-modules/point-transaction/entities/point-transaction.enum';
import { PointTransactionValidation } from 'src/gift-card-modules/point-transaction/point-transaction.validation';
import { PointTransactionException } from 'src/gift-card-modules/point-transaction/point-transaction.exception';
import { CardOrder } from 'src/gift-card-modules/card-order/entities/card-order.entity';

@Injectable()
export class SharedPointTransactionService {
  /**
   *
   */
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(GiftCard)
    private gcRepository: Repository<GiftCard>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(CardOrder)
    private coRepository: Repository<CardOrder>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    @InjectMapper()
    private readonly mapper: Mapper,
    private readonly transactionService: TransactionManagerService,
  ) { }

  async create(req: CreatePointTransactionPayload) {
    const context = `${PointTransaction.name}.${this.create.name}`;
    this.logger.log(
      `Create point transaction req; ${JSON.stringify(req)}`,
      context,
    );

    // Gan TUONG MINH thay cho `mapper.map(req, CreatePointTransactionDto, …)`
    // (buoc 2.13 — 2C): kieu vao khong con la DTO client-facing nua, va
    // `CreatePointTransactionDto.userSlug` la `@AutoMap()` bat buoc nen khong
    // the vua doi khoa vua di qua profile do. Sau khi doi, profile
    // `createMap(CreatePointTransactionDto, PointTransaction)` o
    // `point-transaction.mapper.ts` khong con nguoi doc - de nguyen, no bien
    // mat cung thu muc o giai doan 8.
    const payload = new PointTransaction();
    Object.assign(payload, {
      type: req.type,
      desc: req.desc,
      objectType: req.objectType,
      objectSlug: req.objectSlug,
      points: req.points,
      balance: req.balance,
    } satisfies Partial<PointTransaction>);

    if (
      payload.type === PointTransactionTypeEnum.IN &&
      payload.objectType === PointTransactionObjectTypeEnum.ORDER
    ) {
      throw new PointTransactionException(
        PointTransactionValidation.INVALID_IN_ORDER_TRANSACTION,
      );
    }

    if (
      payload.type === PointTransactionTypeEnum.OUT &&
      payload.objectType === PointTransactionObjectTypeEnum.GIFT_CARD
    ) {
      throw new PointTransactionException(
        PointTransactionValidation.INVALID_OUT_ORDER_TRANSACTION,
      );
    }

    let objectRef: Order | GiftCard | CardOrder = null;

    switch (payload.objectType) {
      case PointTransactionObjectTypeEnum.ORDER:
        objectRef = await this.orderRepository.findOne({
          where: { slug: payload.objectSlug },
        });
        break;
      case PointTransactionObjectTypeEnum.GIFT_CARD:
        objectRef = await this.gcRepository.findOne({
          where: { slug: payload.objectSlug },
        });
        break;
      case PointTransactionObjectTypeEnum.CARD_ORDER:
        objectRef = await this.coRepository.findOne({
          where: { slug: payload.objectSlug },
        });
        break;
      default:
        throw new PointTransactionException(
          PointTransactionValidation.OBJECT_TYPE_NOT_FOUND,
        );
    }

    if (!objectRef)
      throw new PointTransactionException(
        PointTransactionValidation.OBJECT_TYPE_NOT_FOUND,
      );

    // Tra nguoi dung theo `sharedUserId` (buoc 2.13 — 2C, muc 1.10).
    const user = await this.userRepository.findOne({
      where: {
        sharedUserId: assertUserKeyLoaded(req.sharedUserId, context),
      },
    });

    if (!user)
      throw new PointTransactionException(
        PointTransactionValidation.USER_NOT_FOUND,
      );

    // `userSlug` lay tu HANG VUA TRA, khong tu payload: cot
    // `user_slug_column` la NOT NULL khong default, nen bo quen no la MOI
    // `INSERT` vao `point_transaction_tbl` hong - khach bi tru xu that ma
    // khong co dong so cai, khong hoa don, khong phieu bep (loi nang nhat tim
    // ra khi nghiem thu ban 12/09/2026). Lay tu `user.slug` thi khoa va cot
    // guong chac chan cung mot nguoi, va ben goi khong phai truyen slug nua.
    // Cot nay roi `point_transaction_tbl` o giai doan 8.
    Object.assign(payload, {
      objectId: objectRef.id,
      userId: user.id,
      user: user,
      userSlug: user.slug,
    } satisfies Partial<PointTransaction>);

    const pt = await this.transactionService.execute<PointTransaction>(
      async (manager) => {
        return manager.save(payload);
      },
      (res) =>
        this.logger.log(
          `Point transaction created: ${JSON.stringify(res)}`,
          context,
        ),
      (err) => {
        this.logger.error(
          `Error when creating point transaction: ${err.message}`,
          err.stack,
          context,
        );
        throw new PointTransactionException(
          PointTransactionValidation.ERROR_WHEN_CREATE_POINT_TRANSACTION,
        );
      },
    );
    return pt;
  }
}
