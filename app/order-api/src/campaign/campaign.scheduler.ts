import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { User } from 'src/user/user.entity';
import { LessThan, LessThanOrEqual, Repository } from 'typeorm';
import { CampaignStatus, CampaignType } from './campaign.constants';
import { CampaignService } from './campaign.service';
import { Campaign } from './entity/campaign.entity';
import { CampaignIdentities } from './strategy/campaign.strategy';
import { SharedUserServiceClient } from 'src/external-services/shared-user-service/shared-user-service.client';
import { batchLookupSharedUserIdentities } from 'src/user/user.helper';

@Injectable()
export class CampaignScheduler {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    private readonly campaignService: CampaignService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly sharedUserServiceClient: SharedUserServiceClient,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async syncCampaignStatuses(): Promise<void> {
    const context = `${CampaignScheduler.name}.${this.syncCampaignStatuses.name}`;
    const now = new Date();

    const toOpen = await this.campaignRepository.find({
      where: {
        status: CampaignStatus.SCHEDULED,
        startDate: LessThanOrEqual(now),
      },
    });
    if (toOpen.length > 0) {
      await this.campaignRepository.update(
        toOpen.map((c) => c.id),
        { status: CampaignStatus.OPENING },
      );
      this.logger.log(`Opened ${toOpen.length} campaign(s)`, context);
    }

    const toClose = await this.campaignRepository.find({
      where: { status: CampaignStatus.OPENING, endDate: LessThan(now) },
    });
    if (toClose.length > 0) {
      await this.campaignRepository.update(
        toClose.map((c) => c.id),
        { status: CampaignStatus.CLOSED },
      );
      this.logger.log(`Closed ${toClose.length} campaign(s)`, context);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleBirthdayCampaigns(): Promise<void> {
    const context = `${CampaignScheduler.name}.${this.handleBirthdayCampaigns.name}`;
    const today = new Date();
    const monthDay = `${String(today.getDate()).padStart(2, '0')}${String(today.getMonth() + 1).padStart(2, '0')}`;

    const birthdayUsers = await this.userRepository
      .createQueryBuilder('user')
      .where('user.dobDM = :dobDM', { dobDM: `${monthDay}` })
      .andWhere('user.dobDM IS NOT NULL')
      .getMany();

    this.logger.log(
      `Found ${birthdayUsers.length} birthday users for ${monthDay}`,
      context,
    );

    // Buoc 5.6 (5.2(a)): MOT luot lookupByIds cho ca lo (client tu chia moi
    // 200 id) - strategy lay ngon ngu thong bao tu map nay, khong tra lai trong
    // vong lap. Loc `dobDM` cuc bo o tren de lai buoc 8.1.
    let identities: CampaignIdentities;
    try {
      identities = await batchLookupSharedUserIdentities(
        birthdayUsers.map((user) => user.sharedUserId),
        this.sharedUserServiceClient,
        this.logger,
        context,
      );
    } catch {
      // Da log nguyen nhan (Failed to batch-lookup) - ca lo coi nhu khong tra
      // duoc: bo qua tung nguoi ben duoi, khong lam chet job.
      identities = new Map();
    }

    for (const user of birthdayUsers) {
      // Chinh sach loi: khong tra duoc nguoi nay => bo qua (khong cap thuong,
      // khong thong bao bang du lieu cu), ghi log, TIEP TUC LO.
      if (!user.sharedUserId || !identities.has(user.sharedUserId)) {
        this.logger.warn(
          `User ${user.id} (${user.slug}) has no shared-user identity (sharedUserId=${user.sharedUserId ?? 'null'}), skip birthday`,
          context,
        );
        continue;
      }
      try {
        await this.campaignService.triggerForUser(
          user,
          CampaignType.USER_BIRTHDAY,
          identities,
        );
      } catch (error) {
        this.logger.error(
          `Error processing birthday for user ${user.id}: ${error.message}`,
          error.stack,
          context,
        );
      }
    }
  }
}
