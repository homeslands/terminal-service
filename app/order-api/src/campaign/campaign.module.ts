import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueRegisterKey } from 'src/app/app.constants';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedUserServiceModule } from 'src/external-services/shared-user-service/shared-user-service.module';
import { User } from 'src/user/user.entity';
import { Product } from 'src/product/product.entity';
import { VoucherGroup } from 'src/voucher-group/voucher-group.entity';
import { Voucher } from 'src/voucher/entity/voucher.entity';
import { CampaignRecipient } from './entity/campaign-recipient.entity';
import { Campaign } from './entity/campaign.entity';
import { VoucherCampaignTemplate } from './entity/voucher-campaign-template.entity';
import { CampaignController } from './campaign.controller';
import { CampaignListener } from './campaign.listener';
import { CampaignProfile } from './campaign.mapper';
import { CampaignScheduler } from './campaign.scheduler';
import { CampaignService } from './campaign.service';
import { NewUserCampaignStrategy } from './strategy/new-user-campaign/new-user-campaign.strategy';
import { UserBirthdayCampaignStrategy } from './strategy/user-birthday-campaign/user-birthday-campaign.strategy';

@Module({
  imports: [
    SharedUserServiceModule,
    // Buoc 9.5: khoa phan tan cho @Cron cua CampaignScheduler.
    BullModule.registerQueue({ name: QueueRegisterKey.DISTRIBUTE_LOCK_JOB }),
    TypeOrmModule.forFeature([
      Campaign,
      CampaignRecipient,
      VoucherCampaignTemplate,
      VoucherGroup,
      Voucher,
      User,
      Product,
    ]),
  ],
  controllers: [CampaignController],
  providers: [
    CampaignService,
    CampaignProfile,
    NewUserCampaignStrategy,
    UserBirthdayCampaignStrategy,
    CampaignListener,
    CampaignScheduler,
  ],
  exports: [CampaignService],
})
export class CampaignModule {}
