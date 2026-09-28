import { User } from 'src/user/user.entity';
import { Campaign } from '../entity/campaign.entity';
import { CampaignRecipient } from '../entity/campaign-recipient.entity';

export interface ICampaignStrategy {
  execute(campaign: Campaign, user: User): Promise<CampaignRecipient>;
}
