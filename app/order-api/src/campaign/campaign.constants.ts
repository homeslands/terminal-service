export enum CampaignType {
  NEW_USER = 'new-user',
  USER_BIRTHDAY = 'user-birthday',
}

export enum CampaignStatus {
  SCHEDULED = 'scheduled',
  OPENING = 'opening',
  CLOSED = 'closed',
}

export const CampaignAction = {
  USER_CREATED: 'campaign.user.created',
  USER_BIRTHDAY_TRIGGERED: 'campaign.user.birthday.triggered',
} as const;
