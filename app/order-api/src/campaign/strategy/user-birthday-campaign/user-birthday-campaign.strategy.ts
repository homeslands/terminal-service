import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { User } from 'src/user/user.entity';
import {
  VoucherCustomerType,
  VoucherType,
  VoucherValueType,
} from 'src/voucher/voucher.constant';
import { Voucher } from 'src/voucher/entity/voucher.entity';
import { VoucherPaymentMethod } from 'src/voucher/entity/voucher-payment-method.entity';
import { VoucherProduct } from 'src/voucher-product/voucher-product.entity';
import { Product } from 'src/product/product.entity';
import { DataSource, In } from 'typeorm';
import { CampaignRecipient } from '../../entity/campaign-recipient.entity';
import { Campaign } from '../../entity/campaign.entity';
import { ICampaignStrategy } from '../campaign.strategy';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationLanguageService } from 'src/notification/language/notification-language.service';
import {
  NotificationMessageCode,
  NotificationType,
} from 'src/notification/notification.constants';

@Injectable()
export class UserBirthdayCampaignStrategy implements ICampaignStrategy {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly notificationService: NotificationService,
    private readonly notificationLanguageService: NotificationLanguageService,
  ) {}

  async execute(campaign: Campaign, user: User): Promise<CampaignRecipient> {
    const context = `${UserBirthdayCampaignStrategy.name}.${this.execute.name}`;
    const currentYear = new Date().getFullYear();

    let createdVoucher: Voucher;

    const recipient = await this.dataSource.transaction(async (manager) => {
      const { voucherCampaignTemplate, voucherGroup } = campaign;

      const code = `${campaign.slug}-${user.id.slice(0, 8)}-${Date.now()}`;

      const startDate = campaign.startDate;
      const issuedAt = new Date();
      const endDate =
        campaign.endDate ??
        new Date(
          issuedAt.getTime() +
            voucherCampaignTemplate.duration * 24 * 60 * 60 * 1000,
        );

      const valueType =
        voucherCampaignTemplate.type === VoucherType.PERCENT_ORDER
          ? VoucherValueType.PERCENTAGE
          : VoucherValueType.AMOUNT;

      const voucher = manager.create(Voucher, {
        code,
        title: voucherCampaignTemplate.title,
        description: voucherCampaignTemplate.description,
        value: voucherCampaignTemplate.value,
        valueType,
        type: voucherCampaignTemplate.type,
        maxUsage: voucherCampaignTemplate.maxUsage,
        remainingUsage: voucherCampaignTemplate.maxUsage,
        minOrderValue: voucherCampaignTemplate.minOrderValue,
        applicabilityRule: voucherCampaignTemplate.applicabilityRule,
        usageFrequencyUnit: voucherCampaignTemplate.usageFrequencyUnit,
        usageFrequencyValue: voucherCampaignTemplate.usageFrequencyValue,
        maxItems: voucherCampaignTemplate.maxItems,
        startDate,
        endDate,
        isActive: true,
        isPrivate: false,
        isVerificationIdentity: true,
        numberOfUsagePerUser: 1,
        customerType: VoucherCustomerType.PERSON,
        assignedUser: user,
        voucherGroup,
      });
      await manager.save(voucher);
      createdVoucher = voucher;

      if (voucherCampaignTemplate.paymentMethods?.length) {
        const voucherPaymentMethods =
          voucherCampaignTemplate.paymentMethods.map((pm) =>
            manager.create(VoucherPaymentMethod, {
              voucher,
              paymentMethod: pm,
            }),
          );
        await manager.save(VoucherPaymentMethod, voucherPaymentMethods);
      }

      if (voucherCampaignTemplate.productSlugs?.length) {
        const products = await manager.find(Product, {
          where: { slug: In(voucherCampaignTemplate.productSlugs) },
        });
        const voucherProducts = products.map((product) =>
          manager.create(VoucherProduct, { voucher, product }),
        );
        await manager.save(VoucherProduct, voucherProducts);
      }

      // year = current year -> unique constraint (campaign, user, year) prevents duplicate in same year
      const recipientEntity = manager.create(CampaignRecipient, {
        campaign,
        user,
        voucher,
        receivedAt: new Date(),
        year: currentYear,
      });
      const saved = await manager.save(recipientEntity);

      this.logger.log(
        `[USER_BIRTHDAY] Voucher ${voucher.code} created for user ${user.id} via campaign ${campaign.slug} (year=${currentYear})`,
        context,
      );
      return saved;
    });

    try {
      const { title, body } = this.notificationLanguageService.format(
        NotificationMessageCode.VOUCHER_BIRTHDAY_RECEIVED,
        {
          voucherTitle: createdVoucher.title,
          voucherCode: createdVoucher.code,
        },
        user.language ?? 'vi',
      );
      await this.notificationService.create({
        receiverId: user.id,
        type: NotificationType.VOUCHER,
        message: NotificationMessageCode.VOUCHER_BIRTHDAY_RECEIVED,
        title,
        body,
        metadata: {
          voucherCode: createdVoucher.code,
          campaignSlug: campaign.slug,
        },
      });
    } catch (error) {
      this.logger.warn(
        `[USER_BIRTHDAY] Failed to send notification for user ${user.id}: ${error.message}`,
        context,
      );
    }

    return recipient;
  }
}
