import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { User } from 'src/user/user.entity';
import { LessThan, LessThanOrEqual, Repository } from 'typeorm';
import { CampaignStatus, CampaignType } from './campaign.constants';
import { CampaignService } from './campaign.service';
import { Campaign } from './entity/campaign.entity';

@Injectable()
export class CampaignScheduler {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    private readonly campaignService: CampaignService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
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

    for (const user of birthdayUsers) {
      try {
        await this.campaignService.triggerForUser(
          user,
          CampaignType.USER_BIRTHDAY,
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
