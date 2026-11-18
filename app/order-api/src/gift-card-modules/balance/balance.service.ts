import { Inject, Injectable, Logger } from '@nestjs/common';
import { Balance } from './entities/balance.entity';
import { FindOptionsWhere, IsNull, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { FindByFieldDto } from './dto/find-by-field.dto';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import {
  BalanceResponseDto,
  MaxBalanceResponseDto,
} from './dto/balance-response.dto';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { BalanceException } from './balance.exception';
import { BalanceValidation } from './balance.validation';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { User } from 'src/user/user.entity';
import { AuthException } from 'src/auth/auth.exception';
import { AuthValidation } from 'src/auth/auth.validation';
import { SharedUserRefService } from 'src/shared/services/shared-user-ref.service';
import { SharedUserServiceClient } from 'src/external-services/shared-user-service/shared-user-service.client';

@Injectable()
export class BalanceService {
  constructor(
    @InjectRepository(Balance)
    private balanceRepository: Repository<Balance>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectMapper()
    private mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    private transactionService: TransactionManagerService,
    private readonly sharedUserRefService: SharedUserRefService,
    private readonly sharedUserServiceClient: SharedUserServiceClient,
  ) { }

  // Buoc 7.7d (QD17): man chinh sach xu doc so du lon nhat / nho nhat cua
  // MOI vi o shared-user (mot vi moi nguoi, khong chia theo service). Route da
  // gac role o controller. shared-user khong tra loi => 503/162001.
  async analyze(): Promise<MaxBalanceResponseDto> {
    const { maxPoints, minPoints } =
      await this.sharedUserServiceClient.analyzeBalances<MaxBalanceResponseDto>();
    const res = new MaxBalanceResponseDto();
    res.maxPoints = Number(maxPoints);
    res.minPoints = Number(minPoints);
    return res;
  }

  // Buoc 7.7d (QD-T10): `GET /balance?userSlug=` cua nhan vien - hang vi cua
  // MOT khach, doc `/internal/balance/lookup`. Giu khuon mono (muc 1.4):
  // { slug, createdAt, points } cua hang vi - mono map hang `balance_tbl` khong
  // nap quan he nen khong co `user`.
  // - slug khong co hang cuc bo => 400/137000 (`toSharedUserId`);
  // - shared-user khong co nguoi nay (404) hoac nguoi chua co hang vi =>
  //   BALANCE_NOT_FOUND nhu mono;
  // - shared-user khong tra loi => 503/162001, KHONG hieu thanh "0 xu".
  async findOneByUserSlug(userSlug: string): Promise<BalanceResponseDto> {
    const context = `${BalanceService.name}.${this.findOneByUserSlug.name}`;
    const sharedUserId =
      await this.sharedUserRefService.toSharedUserId(userSlug);
    const wallet =
      await this.sharedUserServiceClient.lookupBalance(sharedUserId);
    if (!wallet?.slug) {
      this.logger.warn(
        `No balance row for user ${userSlug} (sharedUserId ${sharedUserId}) at shared-user`,
        context,
      );
      throw new BalanceException(BalanceValidation.BALANCE_NOT_FOUND);
    }
    return Object.assign(new BalanceResponseDto(), {
      slug: wallet.slug,
      createdAt: wallet.createdAt,
      points: Number(wallet.points),
    });
  }

  // Tu buoc 7.7d khong con ai goi (controller doc qua `findOneByUserSlug`).
  // Giu toi khi xoa tep o 8.7 - ca giai doan 2 (khoa rong => IsNull) con soi.
  async findOneByField(payload: FindByFieldDto) {
    const context = `${BalanceService.name}.${this.findOneByField.name}`;
    this.logger.debug(
      `Finding balance by field: ${JSON.stringify(payload)}`,
      context,
    );

    const where: FindOptionsWhere<Balance> = {};
    if (payload.slug) where.slug = payload.slug;
    if (payload.userSlug) where.user = { slug: payload.userSlug };
    // Ca hai khoa deu rong (vd GET /balance khong tham so) => `where = {}` se
    // lay HANG DAU BANG (vi cua nguoi la). Ep `slug IS NULL` de khong khop hang
    // nao => BALANCE_NOT_FOUND ben duoi. Chi khi CA HAI rong: mot khoa rong ma
    // gan IsNull thi hong luot tra theo nguoi dung.
    if (!payload.slug && !payload.userSlug) where.slug = IsNull();

    const balance = await this.balanceRepository.findOne({ where: where });
    if (!balance)
      throw new BalanceException(BalanceValidation.BALANCE_NOT_FOUND);

    return this.mapper.map(balance, Balance, BalanceResponseDto);
  }

  async create(payload: { userSlug: string }) {
    const context = `${BalanceService.name}.${this.create.name}`;
    this.logger.log(
      `Creating balance req: ${JSON.stringify(payload)}`,
      context,
    );

    const user = await this.userRepository.findOne({
      where: { slug: payload.userSlug },
    });
    if (!user) throw new AuthException(AuthValidation.USER_NOT_FOUND);

    const balance = new Balance();

    Object.assign(balance, {
      user: user,
    } as Partial<Balance>);
    return await this.transactionService.execute<Balance>(
      async (manager) => {
        return await manager.save(balance);
      },
      () => this.logger.log(`Balance ${balance.slug} created`, context),
      (error) =>
        this.logger.log(
          `Error when creating balance: ${error.message}`,
          error.stack,
          context,
        ),
    );
  }

  // async calcBalance(payload: {
  //   userSlug: string;
  //   points: number;
  //   type: 'in' | 'out';
  // }) {
  //   const context = `${BalanceService.name}.${this.calcBalance.name}`;
  //   this.logger.log(`Calc balance req: ${JSON.stringify(payload)}`, context);

  //   let balance = await this.balanceRepository.findOne({
  //     where: {
  //       user: {
  //         slug: payload.userSlug,
  //       },
  //     },
  //   });
  //   if (!balance) {
  //     balance = await this.create({ userSlug: payload.userSlug });
  //   }

  //   const points = Math.abs(payload.points);
  //   balance.points = Number(balance.points);

  //   switch (payload.type) {
  //     case 'in':
  //       balance.points += points;
  //       break;
  //     case 'out':
  //       // Throw exceptions
  //       balance.points -= points;
  //       break;
  //     default:
  //       break;
  //   }
  //   await this.transactionService.execute<Balance>(
  //     async (manager) => {
  //       return await manager.save(balance);
  //     },
  //     (result) => {
  //       this.logger.log(`${JSON.stringify(result)}`, context);
  //     },
  //     (error) => {
  //       this.logger.error(
  //         `Error when calc balance: ${error.message}`,
  //         error.stack,
  //         context,
  //       );
  //     },
  //   );
  // }

  async validate(payload: { userSlug: string; points: number }) {
    const context = `${BalanceService.name}.${this.validate.name}`;
    this.logger.log(
      `Validate balance req: ${JSON.stringify(payload)}`,
      context,
    );

    let balance = await this.balanceRepository.findOne({
      where: {
        user: {
          slug: payload.userSlug,
        },
      },
    });
    if (!balance) {
      balance = await this.create({ userSlug: payload.userSlug });
    }

    const newPointsValue = balance.points - payload.points;

    if (newPointsValue < 0) {
      throw new BalanceException(BalanceValidation.INSUFFICIENT_BALANCE);
    }

    return true;
  }
}
