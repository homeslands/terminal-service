import { LoggerService } from '@nestjs/common';
import { SharedUserLookupResponse } from 'src/external-services/shared-user-service/shared-user-service.client';
import { User } from 'src/user/user.entity';
import { UserException } from 'src/user/user.exception';
import { UserValidation } from 'src/user/user.validation';
import { Campaign } from '../entity/campaign.entity';
import { CampaignRecipient } from '../entity/campaign-recipient.entity';

/**
 * Buoc 5.6 (5.2(a), 5-d): identity cua nguoi nhan, theo `sharedUserId`.
 *
 * Campaign dung noi dung hien thi (ngon ngu thong bao, ho ten / SDT / email
 * cua loi chuc) tu `shared-user`, KHONG tu ban sao cuc bo cua `User` - ban sao
 * do co the da cu (khach doi ngon ngu hom nay van nhan thong bao tieng cu).
 *
 * - Duong LO (quet sinh nhat): nguoi goi tra MOT luot `lookupByIds` cho ca lo
 *   roi truyen map nay xuong - khong tra lai trong vong lap.
 * - Duong MOT NGUOI (event sua / tao user): de trong, strategy tu tra mot luot.
 */
export type CampaignIdentities = ReadonlyMap<string, SharedUserLookupResponse>;

export interface ICampaignStrategy {
  execute(
    campaign: Campaign,
    user: User,
    identities?: CampaignIdentities,
  ): Promise<CampaignRecipient>;
}

/**
 * Lay identity cua nguoi nhan, goi TRUOC lenh ghi dau tien cua strategy.
 *
 * Chinh sach loi (5.2(a)): khong tra duoc nguoi nay (khong co `sharedUserId`,
 * `shared-user` khong biet id do, hay `shared-user` khong tra loi - truong hop
 * cuoi `batchLookupSharedUserIdentities` da nem 503) thi BO QUA NGUOI NAY: nem
 * truoc khi cap thuong, `CampaignService.triggerForUser` bat, ghi log va chay
 * tiep campaign / nguoi sau. Khong cap thuong roi gui thong bao bang du lieu cu.
 */
export const requireCampaignIdentity = (
  identities: CampaignIdentities,
  user: User,
  logger: Pick<LoggerService, 'warn'>,
  context: string,
): SharedUserLookupResponse => {
  const identity = user.sharedUserId
    ? identities.get(user.sharedUserId)
    : undefined;
  if (!identity) {
    logger.warn(
      `Campaign recipient ${user.id} (${user.slug}) has no shared-user identity (sharedUserId=${user.sharedUserId ?? 'null'}), skip`,
      context,
    );
    throw new UserException(
      UserValidation.USER_NOT_FOUND,
      'Campaign recipient identity not found in shared-user',
    );
  }
  return identity;
};
