import { Injectable, Logger } from '@nestjs/common';
import { MembershipCard } from './membership-card.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Inject } from '@nestjs/common';
import { InjectMapper } from '@automapper/nestjs';
import { User } from 'src/user/user.entity';
import { UserException } from 'src/user/user.exception';
import { UserValidation } from 'src/user/user.validation';
import { MembershipCardException } from './membership-card.exception';
import { MembershipCardValidation } from './membership-card.validation';
import {
  BulkCreateMembershipCardDto,
  CreateMembershipCardDto,
  MembershipCardResponseDto,
  ReplaceMembershipCardDto,
} from './membership-card.dto';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import _ from 'lodash';
import { getUniquePhoneNumber } from 'src/helper';
import { RoleEnum } from 'src/role/role.enum';
import { Role } from 'src/role/role.entity';
import { RoleException } from 'src/role/role.exception';
import { RoleValidation } from 'src/role/role.validation';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UserGroup } from 'src/user-group/user-group.entity';
import { UserGroupValidation } from 'src/user-group/user-group.validation';
import { UserGroupException } from 'src/user-group/user-group.exception';
import { UserGroupMember } from 'src/user-group-member/user-group-member.entity';
import { UserRequirement } from 'src/user/user-requirement.entity';
import {
  UserRequirementKey,
  UserRequirementLevel,
  UserRequirementScope,
  UserRequirementStatus,
} from 'src/user/user.constant';

@Injectable()
export class MembershipCardService {
  private saltOfRounds: number;
  constructor(
    @InjectRepository(MembershipCard)
    private readonly membershipCardRepository: Repository<MembershipCard>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(UserGroup)
    private readonly userGroupRepository: Repository<UserGroup>,
    @InjectMapper()
    private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    private readonly transactionManagerService: TransactionManagerService,
    private readonly configService: ConfigService,
  ) {
    this.saltOfRounds = this.configService.get<number>('SALT_ROUNDS');
  }

  async createMembershipCard(
    requestData: CreateMembershipCardDto,
  ): Promise<MembershipCardResponseDto> {
    const context = `${MembershipCardService.name}.${this.createMembershipCard.name}`;
    const user = await this.userRepository.findOne({
      where: { slug: requestData.user },
      relations: ['membershipCard'],
    });
    if (!user) {
      this.logger.error(`User not found: ${requestData.user}`, null, context);
      throw new UserException(UserValidation.USER_NOT_FOUND);
    }
    if (user.membershipCard) {
      this.logger.error(
        `User already has a membership card: ${requestData.user}`,
        null,
        context,
      );
      throw new MembershipCardException(
        MembershipCardValidation.USER_ALREADY_HAS_A_MEMBERSHIP_CARD,
      );
    }

    const existingMembershipCard = await this.membershipCardRepository.findOne({
      where: {
        code: requestData.code,
      },
    });
    if (existingMembershipCard) {
      this.logger.error(
        `Membership card already exists: ${requestData.code}`,
        null,
        context,
      );
      throw new MembershipCardException(
        MembershipCardValidation.MEMBERSHIP_CARD_CODE_ALREADY_EXISTS,
      );
    }

    const membershipCard = this.mapper.map(
      requestData,
      CreateMembershipCardDto,
      MembershipCard,
    );

    membershipCard.user = user;
    const savedMembershipCard =
      await this.membershipCardRepository.save(membershipCard);

    this.logger.log(
      `Membership card created: ${savedMembershipCard.slug}`,
      context,
    );
    return this.mapper.map(
      savedMembershipCard,
      MembershipCard,
      MembershipCardResponseDto,
    );
  }

  async bulkCreateMembershipCard(
    createdById: string,
    requestData: BulkCreateMembershipCardDto,
  ): Promise<MembershipCardResponseDto[]> {
    const context = `${MembershipCardService.name}.${this.createMembershipCard.name}`;

    const codes = Array.from(new Set(requestData.codes));

    const existedMembershipCards = await this.membershipCardRepository.find({
      where: { code: In(codes) },
    });

    if (_.size(existedMembershipCards) > 0) {
      this.logger.warn(
        `Membership card code already exists: ${requestData.codes.filter((code) => existedMembershipCards.some((item) => item.code === code)).join(', ')}`,
        context,
      );
      throw new MembershipCardException(
        MembershipCardValidation.MEMBERSHIP_CARD_CODE_ALREADY_EXISTS,
      );
    }

    const membershipCards = codes.map((code) => {
      const membershipCard = new MembershipCard();
      membershipCard.code = code;
      membershipCard.expiredAt = requestData.expiredAt;
      return membershipCard;
    });

    const role = await this.roleRepository.findOne({
      where: {
        name: RoleEnum.Customer,
      },
    });
    if (!role) {
      this.logger.error(`Role not found: ${RoleEnum.Customer}`, null, context);
      throw new RoleException(RoleValidation.ROLE_NOT_FOUND);
    }

    let userGroup = null;
    if (!_.isNil(requestData.userGroup)) {
      userGroup = await this.userGroupRepository.findOne({
        where: { slug: requestData.userGroup },
      });
      if (!userGroup) {
        this.logger.error(
          `User group not found: ${requestData.userGroup}`,
          null,
          context,
        );
        throw new UserGroupException(UserGroupValidation.USER_GROUP_NOT_FOUND);
      }
    }

    const users = await Promise.all(
      membershipCards.map(async (membershipCard) => {
        const blockedPhonenumberRequirement = new UserRequirement();
        blockedPhonenumberRequirement.key =
          UserRequirementKey.NEED_UPDATE_PHONE_NUMBER;
        blockedPhonenumberRequirement.status = UserRequirementStatus.PENDING;
        blockedPhonenumberRequirement.level = UserRequirementLevel.BLOCK;
        blockedPhonenumberRequirement.scope = UserRequirementScope.INITIAL;

        const blockedPasswordRequirement = new UserRequirement();
        blockedPasswordRequirement.key =
          UserRequirementKey.NEED_UPDATE_PASSWORD;
        blockedPasswordRequirement.status = UserRequirementStatus.PENDING;
        blockedPasswordRequirement.level = UserRequirementLevel.BLOCK;
        blockedPasswordRequirement.scope = UserRequirementScope.INITIAL;

        const phonenumber = getUniquePhoneNumber();
        const hashedPass = await bcrypt.hash(phonenumber, this.saltOfRounds);
        const user = this.userRepository.create({
          phonenumber,
          role,
          password: hashedPass,
          firstName: 'Membership',
          lastName: 'Card',
          isVerifiedPhonenumber: true,
          isActive: true,
          membershipCard: membershipCard,
          userRequirements: [
            blockedPhonenumberRequirement,
            blockedPasswordRequirement,
          ],
        } as User);
        return user;
      }),
    );

    const createdUsers = await this.transactionManagerService.execute<User[]>(
      async (manager) => {
        const savedUsers = await manager.save(users);

        if (userGroup) {
          const userGroupMembers = savedUsers.map((user) => {
            const userGroupMember = new UserGroupMember();
            userGroupMember.user = user;
            userGroupMember.userGroup = userGroup;
            userGroupMember.createdBy = createdById;
            return userGroupMember;
          });

          await manager.save(userGroupMembers);
        }
        return savedUsers;
      },
      (results) => {
        this.logger.log(`Membership cards created: ${results.length}`, context);
      },
      (error) => {
        this.logger.error(
          `Error when creating membership cards: ${error.message}`,
          error.stack,
          context,
        );
        throw new MembershipCardException(
          MembershipCardValidation.ERROR_WHEN_CREATE_MEMBERSHIP_CARDS,
        );
      },
    );

    return this.mapper.mapArray(
      createdUsers.map((user) => user.membershipCard),
      MembershipCard,
      MembershipCardResponseDto,
    );
  }

  async toggleActiveMembershipCard(
    userSlug: string,
  ): Promise<MembershipCardResponseDto> {
    const context = `${MembershipCardService.name}.${this.toggleActiveMembershipCard.name}`;
    const user = await this.userRepository.findOne({
      where: { slug: userSlug },
      relations: { membershipCard: true },
    });
    if (!user) {
      this.logger.error(`User not found: ${userSlug}`, null, context);
      throw new UserException(UserValidation.USER_NOT_FOUND);
    }
    if (!user.membershipCard) {
      this.logger.error(
        `User does not have a membership card: ${userSlug}`,
        null,
        context,
      );
      throw new MembershipCardException(
        MembershipCardValidation.MEMBERSHIP_CARD_NOT_FOUND,
      );
    }

    if (!user.membershipCard.isActive) {
      if (
        user.membershipCard.expiredAt &&
        user.membershipCard.expiredAt < new Date()
      ) {
        this.logger.error(
          `Membership card expired: ${user.membershipCard.slug}`,
          null,
          context,
        );
        throw new MembershipCardException(
          MembershipCardValidation.MEMBERSHIP_CARD_EXPIRED,
        );
      }
    }

    const updatedMembershipCard = user.membershipCard;
    updatedMembershipCard.isActive = !updatedMembershipCard.isActive;
    const savedMembershipCard = await this.membershipCardRepository.save(
      updatedMembershipCard,
    );
    this.logger.log(
      `Membership card active status has been toggled: ${savedMembershipCard.slug}`,
      context,
    );
    return this.mapper.map(
      savedMembershipCard,
      MembershipCard,
      MembershipCardResponseDto,
    );
  }

  async replaceMembershipCard(
    requestData: ReplaceMembershipCardDto,
  ): Promise<MembershipCardResponseDto> {
    const context = `${MembershipCardService.name}.${this.replaceMembershipCard.name}`;
    const user = await this.userRepository.findOne({
      where: { slug: requestData.user },
      relations: { membershipCard: true },
    });
    if (!user) {
      this.logger.error(`User not found: ${requestData.user}`, null, context);
      throw new UserException(UserValidation.USER_NOT_FOUND);
    }
    if (!user.membershipCard) {
      this.logger.error(
        `User does not have a membership card: ${requestData.user}`,
        null,
        context,
      );
      throw new MembershipCardException(
        MembershipCardValidation.MEMBERSHIP_CARD_NOT_FOUND,
      );
    }

    const replacedMembershipCard =
      await this.transactionManagerService.execute<MembershipCard>(
        async (manager) => {
          await manager.remove(user.membershipCard);

          const newMembershipCard = this.mapper.map(
            requestData,
            ReplaceMembershipCardDto,
            MembershipCard,
          );
          newMembershipCard.user = user;

          const createdNewMembershipCard =
            await manager.save(newMembershipCard);

          return createdNewMembershipCard;
        },
        (result) => {
          this.logger.log(`Membership card replaced: ${result.slug}`, context);
          return result;
        },
        (error) => {
          this.logger.error(
            `Error replacing membership card: ${error.message}`,
            null,
            context,
          );
          throw new MembershipCardException(
            MembershipCardValidation.ERROR_WHEN_REPLACE_MEMBERSHIP_CARD,
          );
        },
      );

    return this.mapper.map(
      replacedMembershipCard,
      MembershipCard,
      MembershipCardResponseDto,
    );
  }

  async deleteMembershipCard(userSlug: string): Promise<void> {
    const context = `${MembershipCardService.name}.${this.deleteMembershipCard.name}`;
    const user = await this.userRepository.findOne({
      where: { slug: userSlug },
      relations: { membershipCard: true },
    });
    if (!user) {
      this.logger.error(`User not found: ${userSlug}`, null, context);
      throw new UserException(UserValidation.USER_NOT_FOUND);
    }
    if (!user.membershipCard) {
      this.logger.error(
        `User does not have a membership card: ${userSlug}`,
        null,
        context,
      );
      throw new MembershipCardException(
        MembershipCardValidation.MEMBERSHIP_CARD_NOT_FOUND,
      );
    }
    await this.transactionManagerService.execute<void>(
      async (manager) => {
        await manager.remove(user.membershipCard);
      },
      () => {
        this.logger.log(
          `Membership card deleted: ${user.membershipCard.slug}`,
          context,
        );
      },
      (error) => {
        this.logger.error(
          `Error deleting membership card: ${error.message}`,
          null,
          context,
        );
        throw new MembershipCardException(
          MembershipCardValidation.ERROR_WHEN_DELETE_MEMBERSHIP_CARD,
        );
      },
    );
  }
}
