import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export type TCampaignErrorCodeKey =
  | 'CAMPAIGN_NOT_FOUND'
  | 'CAMPAIGN_VOUCHER_GROUP_NOT_FOUND'
  | 'CAMPAIGN_PRODUCT_NOT_FOUND'
  | 'CAMPAIGN_EXECUTION_ERROR'
  | 'UNSUPPORTED_CAMPAIGN_TYPE'
  | 'CAMPAIGN_INVALID_DATE_RANGE'
  | 'CAMPAIGN_INVALID_STATUS_TRANSITION'
  | 'CAMPAIGN_DURATION_REQUIRED_WITHOUT_END_DATE'
  | 'CAMPAIGN_HAS_VOUCHERS';

export type TCampaignErrorCode = Record<TCampaignErrorCodeKey, TErrorCodeValue>;

// 159901 - 160000
export const CampaignValidation: TCampaignErrorCode = {
  CAMPAIGN_NOT_FOUND: createErrorCode(159901, 'Campaign not found'),
  CAMPAIGN_VOUCHER_GROUP_NOT_FOUND: createErrorCode(
    159902,
    'Voucher group not found',
  ),
  CAMPAIGN_PRODUCT_NOT_FOUND: createErrorCode(159903, 'Product not found'),
  CAMPAIGN_EXECUTION_ERROR: createErrorCode(
    159904,
    'Error executing campaign strategy',
  ),
  UNSUPPORTED_CAMPAIGN_TYPE: createErrorCode(
    159905,
    'Unsupported campaign type',
  ),
  CAMPAIGN_INVALID_DATE_RANGE: createErrorCode(
    159906,
    'endDate must be after startDate',
  ),
  CAMPAIGN_INVALID_STATUS_TRANSITION: createErrorCode(
    159907,
    'Campaign status does not match its date range',
  ),
  CAMPAIGN_DURATION_REQUIRED_WITHOUT_END_DATE: createErrorCode(
    159908,
    'duration is required when campaign has no endDate',
  ),
  CAMPAIGN_HAS_VOUCHERS: createErrorCode(
    159909,
    'Cannot delete campaign that already has vouchers created',
  ),
};
