import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Mapper } from '@automapper/core';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { CoinPolicy } from 'src/gift-card-modules/coin-policy/entities/coin-policy.entity';
import { CoinPolicyKeyEnum } from 'src/gift-card-modules/coin-policy/coin-policy.enum';
import { IsMaxBalancePayload } from '../interfaces/commons/shared-coin-policy.interface';
import { SharedUserServiceClient } from 'src/external-services/shared-user-service/shared-user-service.client';
import { BalanceException } from 'src/gift-card-modules/balance/balance.exception';
import { BalanceValidation } from 'src/gift-card-modules/balance/balance.validation';
import { assertUserKeyLoaded } from 'src/user/user.constant';

@Injectable()
export class SharedCoinPolicyService {
  constructor(
    @InjectRepository(CoinPolicy)
    private readonly coinPolicyRepository: Repository<CoinPolicy>,
    @InjectMapper()
    private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    private readonly transactionService: TransactionManagerService,
    // Buoc 7.7a: doc so du qua shared-user, KHONG con phu thuoc
    // `SharedBalanceService` (GD8 xoa no, coin-policy o lai).
    private readonly sharedUserServiceClient: SharedUserServiceClient,
  ) { }

  async isExceedBalance(payload: IsMaxBalancePayload) {
    const policy = await this.coinPolicyRepository.findOne({
      where: {
        key: CoinPolicyKeyEnum.MAX_BALANCE,
      },
    });
    if (!policy?.isActive) return false;

    // Buoc 5.4 (5-b): CHO DOC SO DU DUY NHAT cua luat tran (don the + dung the
    // qua deu goi ham nay). Buoc 7.7a: so du doc tu vi o shared-user
    // (`/internal/balance/lookup`). Tran (`coin_policy`) van la luat cua
    // terminal, khong doi cho. shared-user khong tra loi => 503 (fail-closed:
    // khong biet so du thi khong cho vuot tran mot cach mu).
    const context = `${SharedCoinPolicyService.name}.${this.isExceedBalance.name}`;
    const points = await this.sharedUserServiceClient.lookupBalancePoints(
      assertUserKeyLoaded(payload.sharedUserId, context),
    );
    if (points === null) {
      throw new BalanceException(BalanceValidation.BALANCE_NOT_FOUND);
    }
    const newBalance = points + payload.totalPoints;
    const maxBalance = +policy.value;
    return newBalance > maxBalance;
  }
}
