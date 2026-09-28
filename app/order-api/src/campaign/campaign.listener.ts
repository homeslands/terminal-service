import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { User } from 'src/user/user.entity';
import { CampaignAction, CampaignType } from './campaign.constants';
import { CampaignService } from './campaign.service';

@Injectable()
export class CampaignListener {
  constructor(
    private readonly campaignService: CampaignService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
  ) {}

  @OnEvent(CampaignAction.USER_CREATED, { async: true })
  async handleUserCreated(payload: { user: User }): Promise<void> {
    const context = `${CampaignListener.name}.${this.handleUserCreated.name}`;
    try {
      await this.campaignService.triggerForUser(
        payload.user,
        CampaignType.NEW_USER,
      );
    } catch (error) {
      this.logger.error(
        `Error in campaign USER_CREATED handler: ${error.message}`,
        error.stack,
        context,
      );
    }
  }

  @OnEvent(CampaignAction.USER_BIRTHDAY_TRIGGERED, { async: true })
  async handleUserBirthdayTriggered(payload: { user: User }): Promise<void> {
    const context = `${CampaignListener.name}.${this.handleUserBirthdayTriggered.name}`;
    try {
      await this.campaignService.triggerForUser(
        payload.user,
        CampaignType.USER_BIRTHDAY,
      );
    } catch (error) {
      this.logger.error(
        `Error in campaign USER_BIRTHDAY_TRIGGERED handler: ${error.message}`,
        error.stack,
        context,
      );
    }
  }
}
