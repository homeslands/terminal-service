import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { FindManyOptions, In, LessThanOrEqual, Repository } from 'typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { VoucherGroup } from 'src/voucher-group/voucher-group.entity';
import { Product } from 'src/product/product.entity';
import { User } from 'src/user/user.entity';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { CampaignRecipient } from './entity/campaign-recipient.entity';
import { Campaign } from './entity/campaign.entity';
import { VoucherCampaignTemplate } from './entity/voucher-campaign-template.entity';
import { CampaignException } from './campaign.exception';
import { CampaignType, CampaignStatus } from './campaign.constants';
import { CampaignValidation } from './campaign.validation';
import {
  CampaignKeyResponseDto,
  CampaignResponseDto,
  CreateCampaignRequestDto,
  GetAllCampaignQueryRequestDto,
  UpdateCampaignRequestDto,
} from './campaign.dto';
import { ICampaignStrategy } from './strategy/campaign.strategy';
import { NewUserCampaignStrategy } from './strategy/new-user-campaign/new-user-campaign.strategy';
import { UserBirthdayCampaignStrategy } from './strategy/user-birthday-campaign/user-birthday-campaign.strategy';
import { RoleEnum } from 'src/role/role.enum';

@Injectable()
export class CampaignService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(CampaignRecipient)
    private readonly recipientRepository: Repository<CampaignRecipient>,
    @InjectRepository(VoucherGroup)
    private readonly voucherGroupRepository: Repository<VoucherGroup>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(VoucherCampaignTemplate)
    private readonly voucherCampaignTemplateRepository: Repository<VoucherCampaignTemplate>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly newUserCampaignStrategy: NewUserCampaignStrategy,
    private readonly userBirthdayCampaignStrategy: UserBirthdayCampaignStrategy,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
  ) {}

  getAllCampaignKeys(): CampaignKeyResponseDto[] {
    const context = `${CampaignService.name}.${this.getAllCampaignKeys.name}`;
    this.logger.log(`Get all campaign keys`, context);
    return Object.values(CampaignType).map((key) => ({ key }));
  }

  async create(dto: CreateCampaignRequestDto): Promise<CampaignResponseDto> {
    const context = `${CampaignService.name}.${this.create.name}`;

    const voucherGroup = await this.voucherGroupRepository.findOne({
      where: { slug: dto.voucherGroupSlug },
    });
    if (!voucherGroup) {
      throw new CampaignException(
        CampaignValidation.CAMPAIGN_VOUCHER_GROUP_NOT_FOUND,
      );
    }

    const now = new Date();

    if (dto.startDate <= now) {
      throw new CampaignException(
        CampaignValidation.CAMPAIGN_INVALID_STATUS_TRANSITION,
      );
    }

    if (dto.endDate && dto.endDate <= dto.startDate) {
      throw new CampaignException(
        CampaignValidation.CAMPAIGN_INVALID_DATE_RANGE,
      );
    }

    const campaign = this.mapper.map(dto, CreateCampaignRequestDto, Campaign);
    campaign.voucherGroup = voucherGroup;
    campaign.status = CampaignStatus.SCHEDULED;

    if (dto.voucherCampaignTemplate) {
      if (dto.endDate) {
        dto.voucherCampaignTemplate.duration = null;
      } else if (!dto.voucherCampaignTemplate.duration) {
        throw new CampaignException(
          CampaignValidation.CAMPAIGN_DURATION_REQUIRED_WITHOUT_END_DATE,
        );
      }

      if (dto.voucherCampaignTemplate.productSlugs?.length) {
        await this.validateProductSlugs(
          dto.voucherCampaignTemplate.productSlugs,
        );
      }
      const template = new VoucherCampaignTemplate();
      Object.assign(template, dto.voucherCampaignTemplate);
      campaign.voucherCampaignTemplate = template;
    }

    const saved = await this.campaignRepository.save(campaign);
    this.logger.log(`Campaign created: ${saved.slug}`, context);

    const result = await this.campaignRepository.findOne({
      where: { id: saved.id },
      relations: { voucherGroup: true, voucherCampaignTemplate: true },
    });
    return this.mapper.map(result, Campaign, CampaignResponseDto);
  }

  async findAll(
    query: GetAllCampaignQueryRequestDto,
  ): Promise<AppPaginatedResponseDto<CampaignResponseDto>> {
    const findManyOptions: FindManyOptions<Campaign> = {
      where: {
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      relations: { voucherGroup: true, voucherCampaignTemplate: true },
      order: { createdAt: 'DESC' },
    };

    if (query.hasPaging) {
      Object.assign(findManyOptions, {
        skip: (query.page - 1) * query.size,
        take: query.size,
      });
    }

    const [campaigns, total] =
      await this.campaignRepository.findAndCount(findManyOptions);
    const totalPages = Math.ceil(total / query.size);

    return {
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
      items: this.mapper.mapArray(campaigns, Campaign, CampaignResponseDto),
      total,
      page: query.hasPaging ? query.page : 1,
      pageSize: query.hasPaging ? query.size : total,
      totalPages,
    } as AppPaginatedResponseDto<CampaignResponseDto>;
  }

  async findOne(slug: string): Promise<CampaignResponseDto> {
    const campaign = await this.campaignRepository.findOne({
      where: { slug },
      relations: { voucherGroup: true, voucherCampaignTemplate: true },
    });
    if (!campaign) {
      throw new CampaignException(CampaignValidation.CAMPAIGN_NOT_FOUND);
    }
    return this.mapper.map(campaign, Campaign, CampaignResponseDto);
  }

  async update(
    slug: string,
    dto: UpdateCampaignRequestDto,
  ): Promise<CampaignResponseDto> {
    const context = `${CampaignService.name}.${this.update.name}`;

    const campaign = await this.campaignRepository.findOne({
      where: { slug },
      relations: { voucherGroup: true, voucherCampaignTemplate: true },
    });
    if (!campaign) {
      throw new CampaignException(CampaignValidation.CAMPAIGN_NOT_FOUND);
    }

    const now = new Date();
    const effectiveStartDate = dto.startDate ?? campaign.startDate;
    const effectiveEndDate =
      dto.endDate !== undefined ? dto.endDate : campaign.endDate;

    if (effectiveEndDate && effectiveEndDate <= effectiveStartDate) {
      throw new CampaignException(
        CampaignValidation.CAMPAIGN_INVALID_DATE_RANGE,
      );
    }

    if (dto.status === CampaignStatus.OPENING && effectiveStartDate > now) {
      throw new CampaignException(
        CampaignValidation.CAMPAIGN_INVALID_STATUS_TRANSITION,
      );
    }

    if (dto.status === CampaignStatus.SCHEDULED && effectiveStartDate <= now) {
      throw new CampaignException(
        CampaignValidation.CAMPAIGN_INVALID_STATUS_TRANSITION,
      );
    }

    if (dto.voucherGroupSlug) {
      const voucherGroup = await this.voucherGroupRepository.findOne({
        where: { slug: dto.voucherGroupSlug },
      });
      if (!voucherGroup) {
        throw new CampaignException(
          CampaignValidation.CAMPAIGN_VOUCHER_GROUP_NOT_FOUND,
        );
      }
      campaign.voucherGroup = voucherGroup;
    }

    if (dto.voucherCampaignTemplate !== undefined) {
      if (effectiveEndDate) {
        dto.voucherCampaignTemplate.duration = null;
      } else {
        const effectiveDuration =
          dto.voucherCampaignTemplate.duration ??
          campaign.voucherCampaignTemplate?.duration;
        if (!effectiveDuration) {
          throw new CampaignException(
            CampaignValidation.CAMPAIGN_DURATION_REQUIRED_WITHOUT_END_DATE,
          );
        }
      }

      if (dto.voucherCampaignTemplate.productSlugs?.length) {
        await this.validateProductSlugs(
          dto.voucherCampaignTemplate.productSlugs,
        );
      }
      if (campaign.voucherCampaignTemplate) {
        Object.assign(
          campaign.voucherCampaignTemplate,
          dto.voucherCampaignTemplate,
        );
      } else {
        const template = new VoucherCampaignTemplate();
        Object.assign(template, dto.voucherCampaignTemplate);
        campaign.voucherCampaignTemplate = template;
      }
    } else if (dto.endDate !== undefined && campaign.voucherCampaignTemplate) {
      if (effectiveEndDate) {
        campaign.voucherCampaignTemplate.duration = null;
      } else if (!campaign.voucherCampaignTemplate.duration) {
        throw new CampaignException(
          CampaignValidation.CAMPAIGN_DURATION_REQUIRED_WITHOUT_END_DATE,
        );
      }
    }

    if (dto.name !== undefined) campaign.name = dto.name;
    if (dto.status !== undefined) campaign.status = dto.status;
    if (dto.recipientLimit !== undefined)
      campaign.recipientLimit = dto.recipientLimit;
    if (dto.startDate !== undefined) campaign.startDate = dto.startDate;
    if (dto.endDate !== undefined) campaign.endDate = dto.endDate;

    const saved = await this.campaignRepository.save(campaign);
    this.logger.log(`Campaign updated: ${saved.slug}`, context);

    const result = await this.campaignRepository.findOne({
      where: { id: saved.id },
      relations: { voucherGroup: true, voucherCampaignTemplate: true },
    });
    return this.mapper.map(result, Campaign, CampaignResponseDto);
  }

  async delete(slug: string): Promise<void> {
    const context = `${CampaignService.name}.${this.delete.name}`;

    const campaign = await this.campaignRepository.findOne({
      where: { slug },
      relations: { voucherCampaignTemplate: true },
    });
    if (!campaign) {
      throw new CampaignException(CampaignValidation.CAMPAIGN_NOT_FOUND);
    }

    const recipientCount = await this.recipientRepository.count({
      where: { campaign: { id: campaign.id } },
    });
    if (recipientCount > 0) {
      throw new CampaignException(CampaignValidation.CAMPAIGN_HAS_VOUCHERS);
    }

    if (campaign.voucherCampaignTemplate) {
      await this.voucherCampaignTemplateRepository.remove(
        campaign.voucherCampaignTemplate,
      );
    }

    await this.campaignRepository.remove(campaign);
    this.logger.log(`Campaign deleted: ${slug}`, context);
  }

  async triggerForUser(user: User, campaignType: CampaignType): Promise<void> {
    const context = `${CampaignService.name}.${this.triggerForUser.name}`;

    const roleName =
      user.role?.name ??
      (
        await this.userRepository.findOne({
          where: { id: user.id },
          relations: { role: true },
        })
      )?.role?.name;

    if (roleName !== RoleEnum.Customer) {
      this.logger.log(
        `Skipping campaign for non-customer user ${user.id} (role: ${roleName})`,
        context,
      );
      return;
    }

    const now = new Date();

    const campaigns = await this.campaignRepository.find({
      where: {
        type: campaignType,
        status: CampaignStatus.OPENING,
        startDate: LessThanOrEqual(now),
      },
      relations: { voucherGroup: true, voucherCampaignTemplate: true },
    });

    const activeCampaigns = campaigns.filter(
      (c) => !c.endDate || c.endDate >= now,
    );

    for (const campaign of activeCampaigns) {
      const eligible = await this.checkEligibility(campaign, user);
      if (!eligible) continue;

      try {
        const strategy = this.selectStrategy(campaign);
        await strategy.execute(campaign, user);
      } catch (error) {
        this.logger.warn(
          `Campaign ${campaign.slug} failed for user ${user.id}: ${error.message}`,
          context,
        );
      }
    }
  }

  private async checkEligibility(
    campaign: Campaign,
    user: User,
  ): Promise<boolean> {
    const currentYear = new Date().getFullYear();

    if (campaign.type === CampaignType.USER_BIRTHDAY) {
      const count = await this.recipientRepository.count({
        where: {
          campaign: { id: campaign.id },
          user: { id: user.id },
          year: currentYear,
        },
      });
      if (count > 0) return false;
    } else {
      const count = await this.recipientRepository.count({
        where: {
          campaign: { id: campaign.id },
          user: { id: user.id },
        },
      });
      if (count > 0) return false;
    }

    if (campaign.recipientLimit != null) {
      const totalRecipients = await this.recipientRepository.count({
        where: { campaign: { id: campaign.id } },
      });
      if (totalRecipients >= campaign.recipientLimit) return false;
    }

    return true;
  }

  private async validateProductSlugs(slugs: string[]): Promise<void> {
    const found = await this.productRepository.find({
      where: { slug: In(slugs) },
      select: ['slug'],
    });
    if (found.length !== slugs.length) {
      throw new CampaignException(
        CampaignValidation.CAMPAIGN_PRODUCT_NOT_FOUND,
      );
    }
  }

  private selectStrategy(campaign: Campaign): ICampaignStrategy {
    switch (campaign.type) {
      case CampaignType.NEW_USER:
        return this.newUserCampaignStrategy;
      case CampaignType.USER_BIRTHDAY:
        return this.userBirthdayCampaignStrategy;
      default:
        throw new CampaignException(
          CampaignValidation.UNSUPPORTED_CAMPAIGN_TYPE,
        );
    }
  }
}
