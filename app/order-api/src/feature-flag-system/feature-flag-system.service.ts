import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FeatureFlagSystem } from './entities/feature-flag-system.entity';
import { FeatureSystemGroup } from './entities/feature-system-group.entity';
import { Mapper } from '@automapper/core';
import {
  BulkUpdateChildFeatureFlagSystemRequestDto,
  BulkUpdateFeatureFlagSystemRequestDto,
  FeatureFlagSystemResponseDto,
  FeatureSystemGroupResponseDto,
} from './feature-flag-system.dto';
import { InjectMapper } from '@automapper/nestjs';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { FeatureFlagSystemException } from './feature-flag-system.exception';
import { FeatureFlagSystemValidation } from './feature-flag-system.validation';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { ChildFeatureFlagSystem } from './entities/child-feature-flag-system.entity';

@Injectable()
export class FeatureFlagSystemService {
  constructor(
    @InjectRepository(FeatureFlagSystem)
    private readonly featureFlagSystemRepository: Repository<FeatureFlagSystem>,
    @InjectRepository(FeatureSystemGroup)
    private readonly featureSystemGroupRepository: Repository<FeatureSystemGroup>,
    @InjectRepository(ChildFeatureFlagSystem)
    private readonly childFeatureFlagSystemRepository: Repository<ChildFeatureFlagSystem>,
    @InjectMapper()
    private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    private readonly transactionService: TransactionManagerService,
  ) {}

  async isEnabled(
    group: string,
    feature: string,
    childFeature: string = null,
  ): Promise<boolean> {
    const isLockedFeature = await this.isLockedFeature(
      group,
      feature,
      childFeature,
    );
    if (isLockedFeature) {
      return false;
    }
    return true;
  }

  async validateFeatureFlag(
    group: string,
    feature: string,
    childFeature: string = null,
  ): Promise<void> {
    const context = `${FeatureFlagSystemService.name}.${this.validateFeatureFlag.name}`;

    const isLockedFeature = await this.isLockedFeature(
      group,
      feature,
      childFeature,
    );

    if (isLockedFeature) {
      this.logger.error(
        `Feature ${feature} in group ${group} and child feature ${childFeature} is locked`,
        context,
      );
      throw new FeatureFlagSystemException(
        FeatureFlagSystemValidation.FEATURE_IS_LOCKED,
      );
    }
  }

  async isLockedFeature(
    group: string,
    feature: string,
    childFeature: string = null,
  ): Promise<boolean> {
    const flag = await this.featureFlagSystemRepository.findOne({
      where: { name: feature, groupName: group },
    });
    const isLockedFlag = flag?.isLocked ?? false;

    if (isLockedFlag) return true;

    if (childFeature) {
      const childFlag = await this.childFeatureFlagSystemRepository.findOne({
        where: {
          name: childFeature,
          featureFlagSystem: { name: feature, groupName: group },
        },
      });
      const isLockedChildFlag = childFlag?.isLocked ?? false;

      if (isLockedChildFlag) return true;
    }

    return false;
  }

  async setFlag(flagKey: string, enabled: boolean): Promise<void> {
    await this.featureFlagSystemRepository.save({
      name: flagKey,
      isLocked: enabled,
    });
  }

  async getAllFeaturesGroupSystem(): Promise<FeatureSystemGroupResponseDto[]> {
    const groups = await this.featureSystemGroupRepository.find({
      order: {
        createdAt: 'ASC',
      },
      relations: {
        features: {
          children: true,
        },
      },
    });

    return this.mapper.mapArray(
      groups,
      FeatureSystemGroup,
      FeatureSystemGroupResponseDto,
    );
  }

  async getAllFeaturesFlagSystem(
    groupName: string,
  ): Promise<FeatureFlagSystemResponseDto[]> {
    const features = await this.featureFlagSystemRepository.find({
      where: { groupName },
      relations: {
        children: true,
      },
      order: {
        createdAt: 'ASC',
      },
    });
    return this.mapper.mapArray(
      features,
      FeatureFlagSystem,
      FeatureFlagSystemResponseDto,
    );
  }

  async bulkToggleFlag(body: BulkUpdateFeatureFlagSystemRequestDto) {
    const context = `${FeatureFlagSystemService.name}.${this.bulkToggleFlag.name}`;
    this.logger.log(
      `Bulk toggle feature flag system req: ${JSON.stringify(body)}`,
      context,
    );

    const slugs = body.updates.map((item) => item.slug);
    const flags = await this.featureFlagSystemRepository.find({
      where: {
        slug: In(slugs),
      },
      relations: {
        children: true,
      },
    });

    const updates = [];
    for (const update of body.updates) {
      const flag = flags.find((item) => item.slug === update.slug);
      if (flag) {
        flag.isLocked = update.isLocked;
        flag.children.forEach((child) => {
          child.isLocked = update.isLocked;
        });
        updates.push(flag);
      }
    }

    await this.transactionService.execute<FeatureFlagSystem[]>(
      async (manager) => {
        return await manager.save(updates);
      },
      (results) => {
        this.logger.log(
          `feature flag system ${results.map((item) => item.slug).join(', ')} updated successfully`,
          context,
        );
      },
      (err) => {
        this.logger.error(
          `Error when bulk toggle feature flag system: ${err.message}`,
          err.stack,
          context,
        );
        throw new FeatureFlagSystemException(
          FeatureFlagSystemValidation.ERROR_WHEN_UPDATE_FEATURE_FLAG_SYSTEM,
        );
      },
    );
  }

  async bulkToggleChildFlag(body: BulkUpdateChildFeatureFlagSystemRequestDto) {
    const context = `${FeatureFlagSystemService.name}.${this.bulkToggleChildFlag.name}`;
    this.logger.log(
      `Bulk toggle child feature flag system req: ${JSON.stringify(body)}`,
      context,
    );

    const slugs = body.updates.map((item) => item.slug);
    const childFlags = await this.childFeatureFlagSystemRepository.find({
      where: {
        slug: In(slugs),
      },
      relations: {
        featureFlagSystem: true,
      },
    });

    const childFlagUpdates = [];
    const enableFlagUpdatesMap = new Map<string, FeatureFlagSystem>();

    for (const update of body.updates) {
      const childFlag = childFlags.find((item) => item.slug === update.slug);
      if (childFlag) {
        childFlag.isLocked = update.isLocked;
        childFlagUpdates.push(childFlag);
        if (!update.isLocked) {
          // if child feature is enabled, and parent feature is locked,
          // => enable parent feature and this child feature
          if (childFlag.featureFlagSystem.isLocked) {
            // check enable flag
            childFlag.featureFlagSystem.isLocked = false;
            const parentId = childFlag.featureFlagSystem.id;
            enableFlagUpdatesMap.set(parentId, childFlag.featureFlagSystem);
          }
        }
      }
    }
    const enableFlagUpdates = Array.from(enableFlagUpdatesMap.values());

    const childFeatureFlagSystems = await this.transactionService.execute<
      ChildFeatureFlagSystem[]
    >(
      async (manager) => {
        if (enableFlagUpdates.length > 0) {
          await manager.save(enableFlagUpdates);
        }
        return await manager.save(childFlagUpdates);
      },
      (results) => {
        this.logger.log(
          `child feature flag system ${results.map((item) => item.slug).join(', ')} updated successfully`,
          context,
        );
      },
      (err) => {
        this.logger.error(
          `Error when bulk toggle feature flag system: ${err.message}`,
          err.stack,
          context,
        );
        throw new FeatureFlagSystemException(
          FeatureFlagSystemValidation.ERROR_WHEN_UPDATE_FEATURE_FLAG_SYSTEM,
        );
      },
    );

    const disableFlagSlugs = childFeatureFlagSystems.map(
      (item) => item.featureFlagSystem.slug,
    );

    const flags = await this.featureFlagSystemRepository.find({
      where: { slug: In(disableFlagSlugs) },
      relations: {
        children: true,
      },
    });

    const disableFlagUpdates = flags.filter((item) => {
      if (item.children.every((child) => child.isLocked)) {
        item.isLocked = true;
        return item;
      }
    });

    await this.transactionService.execute<void>(
      async (manager) => {
        if (disableFlagUpdates.length > 0) {
          await manager.save(disableFlagUpdates);
        }
      },
      () => {
        this.logger.log(
          `Feature flag system disabled when all children disabled updated successfully`,
          context,
        );
      },
    );
  }
}
