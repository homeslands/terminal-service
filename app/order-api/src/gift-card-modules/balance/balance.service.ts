import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  BalanceResponseDto,
  MaxBalanceResponseDto,
} from './dto/balance-response.dto';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { BalanceException } from './balance.exception';
import { BalanceValidation } from './balance.validation';
import { SharedUserRefService } from 'src/shared/services/shared-user-ref.service';
import { SharedUserServiceClient } from 'src/external-services/shared-user-service/shared-user-service.client';

// Buoc 8.7: mat tien vi xu - moi so lieu doc o shared-user. Ba method doc /
// ghi `balance_tbl` cuc bo (`findOneByField`, `create`, `validate`) da xoa:
// khong ai goi tu 7.7d, bang dong bang tu 7.8 va roi service o 8.9.
@Injectable()
export class BalanceService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    private readonly sharedUserRefService: SharedUserRefService,
    private readonly sharedUserServiceClient: SharedUserServiceClient,
  ) {}

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
}
