import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import {
  FindManyOptions,
  FindOptionsWhere,
  In,
  Like,
  Repository,
} from 'typeorm';
import { User } from './user.entity';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  CompleteUserRegistrationRequestDto,
  CreateUserRequestDto,
  GetAllUserQueryRequestDto,
  UpdateUserLanguageRequestDto,
  UpdateUserRequestDto,
  UpdateUserRoleRequestDto,
  UserResponseDto,
} from './user.dto';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { MailService } from 'src/mail/mail.service';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Role } from 'src/role/role.entity';
import { UserException } from './user.exception';
import { UserValidation } from './user.validation';
import { RoleValidation } from 'src/role/role.validation';
import { RoleException } from 'src/role/role.exception';
import * as _ from 'lodash';
import { BranchValidation } from 'src/branch/branch.validation';
import { BranchException } from 'src/branch/branch.exception';
import { Branch } from 'src/branch/branch.entity';
import { AuthException } from 'src/auth/auth.exception';
import { AuthValidation } from 'src/auth/auth.validation';
import { RoleEnum } from 'src/role/role.enum';
import { AuthProfileResponseDto } from 'src/auth/auth.dto';
import {
  UserRequirementKey,
  UserRequirementLevel,
  UserRequirementScope,
  UserRequirementStatus,
} from './user.constant';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { UserRequirement } from './user-requirement.entity';
import { CampaignAction } from 'src/campaign/campaign.constants';

@Injectable()
export class UserService {
  private saltOfRounds: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectMapper()
    private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    private readonly transactionManagerService: TransactionManagerService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.saltOfRounds = this.configService.get<number>('SALT_ROUNDS');
  }

  private isTodayBirthday(dobDM: string): boolean {
    const today = new Date();
    const todayDM = `${String(today.getDate()).padStart(2, '0')}${String(today.getMonth() + 1).padStart(2, '0')}`;
    return dobDM === todayDM;
  }

  async getUserBySlug(slug: string) {
    const context = `${UserService.name}.${this.getUserBySlug.name}`;
    const user = await this.userRepository.findOne({
      where: {
        slug,
      },
      relations: ['branch', 'role'],
    });

    if (!user) {
      this.logger.error(`User not found`, context);
      throw new UserException(UserValidation.USER_NOT_FOUND);
    }

    return this.mapper.map(user, User, UserResponseDto);
  }

  async updateUser(slug: string, requestData: UpdateUserRequestDto) {
    const context = `${UserService.name}.${this.updateUser.name}`;
    const user = await this.userRepository.findOne({
      where: { slug },
      relations: ['branch', 'role'],
    });
    if (!user) throw new UserException(UserValidation.USER_NOT_FOUND);

    Object.assign(user, {
      ...requestData,
    });

    if (requestData.branch) {
      const branch = await this.branchRepository.findOne({
        where: { slug: requestData.branch },
      });
      if (!branch) {
        this.logger.warn(`Branch ${requestData.branch} not found`, context);
        throw new BranchException(BranchValidation.BRANCH_NOT_FOUND);
      }
      user.branch = branch;
    }

    if (requestData.dob) {
      const [day, month] = requestData.dob.split('/');
      user.dobDM = `${day}${month}`;
    }
    try {
      const updatedUser = await this.userRepository.save(user);
      this.logger.log(`User ${user.id} updated profile`, context);
      if (
        requestData.dob &&
        updatedUser.dobDM &&
        this.isTodayBirthday(updatedUser.dobDM)
      )
        this.eventEmitter.emit(CampaignAction.USER_BIRTHDAY_TRIGGERED, {
          user: updatedUser,
        });
      return this.mapper.map(updatedUser, User, UserResponseDto);
    } catch (error) {
      this.logger.error(
        `Error when updating user: ${error.message}`,
        error.stack,
        context,
      );
      throw new AuthException(AuthValidation.ERROR_UPDATE_USER);
    }
  }

  async completeUserRegistration(
    userSlug: string,
    requestData: CompleteUserRegistrationRequestDto,
  ) {
    const context = `${UserService.name}.${this.completeUserRegistration.name}`;
    const user = await this.userRepository.findOne({
      where: { slug: userSlug },
      relations: { userRequirements: true },
    });
    if (!user) throw new UserException(UserValidation.USER_NOT_FOUND);

    const blockedPhonenumberRequirement = user.userRequirements.find(
      (requirement) =>
        requirement.key === UserRequirementKey.NEED_UPDATE_PHONE_NUMBER &&
        requirement.status === UserRequirementStatus.PENDING &&
        requirement.level === UserRequirementLevel.BLOCK &&
        requirement.scope === UserRequirementScope.INITIAL,
    );
    // const blockedPasswordRequirement = user.userRequirements.find(
    //   (requirement) =>
    //     requirement.key === UserRequirementKey.NEED_UPDATE_PASSWORD &&
    //     requirement.status === UserRequirementStatus.PENDING &&
    //     requirement.level === UserRequirementLevel.BLOCK &&
    //     requirement.scope === UserRequirementScope.INITIAL,
    // );

    if (blockedPhonenumberRequirement) {
      if (user.phonenumber === requestData.phonenumber) {
        this.logger.warn(
          AuthValidation.NEED_UPDATE_PHONE_NUMBER.message,
          context,
        );
        throw new AuthException(AuthValidation.NEED_UPDATE_PHONE_NUMBER);
      } else {
        const existedPhonenumber = await this.userRepository.findOne({
          where: {
            phonenumber: requestData.phonenumber,
          },
        });
        if (existedPhonenumber) {
          this.logger.error(
            AuthValidation.PHONE_NUMBER_ALREADY_EXISTS.message,
            null,
            context,
          );
          throw new AuthException(AuthValidation.PHONE_NUMBER_ALREADY_EXISTS);
        }
        Object.assign(user, {
          phonenumber: requestData.phonenumber,
        });
        blockedPhonenumberRequirement.status = UserRequirementStatus.COMPLETED;
      }
    }

    // if (blockedPasswordRequirement) {
    //   const isMatch = await bcrypt.compare(requestData.password, user.password);
    //   if (isMatch) {
    //     this.logger.warn(AuthValidation.NEED_UPDATE_PASSWORD.message, context);
    //     throw new AuthException(AuthValidation.NEED_UPDATE_PASSWORD);
    //   } else {
    //     const hashedPass = await bcrypt.hash(
    //       requestData.password,
    //       this.saltOfRounds,
    //     );
    //     Object.assign(user, {
    //       password: hashedPass,
    //     });
    //     blockedPasswordRequirement.status = UserRequirementStatus.COMPLETED;
    //   }
    // }

    // if (!blockedPhonenumberRequirement && !blockedPasswordRequirement) {
    //   this.logger.error(
    //     `User ${user.slug} has no blocked requirement`,
    //     context,
    //   );
    //   throw new AuthException(
    //     AuthValidation.USER_NOT_HAVE_ANY_REQUIREMENT_MUST_BE_COMPLETED,
    //   );
    // }
    if (!blockedPhonenumberRequirement) {
      this.logger.error(
        `User ${user.slug} has no blocked phone number requirement`,
        context,
      );
      throw new AuthException(
        AuthValidation.USER_NOT_HAVE_BLOCKED_PHONE_NUMBER_REQUIREMENT,
      );
    }

    if (!user.isActive) {
      user.isActive = true;
    }

    await this.transactionManagerService.execute<void>(
      async (manager) => {
        await manager.save(user);
        if (blockedPhonenumberRequirement) {
          await manager.save(blockedPhonenumberRequirement);
        }
        // if (blockedPasswordRequirement) {
        //   await manager.save(blockedPasswordRequirement);
        // }
      },
      () => {
        this.logger.log(
          `User ${user.slug} registration has been completed`,
          context,
        );
      },
      (error) => {
        this.logger.warn(
          `Error when completing user registration: ${error.message}`,
          context,
        );
        throw new AuthException(
          AuthValidation.ERROR_COMPLETE_USER_REGISTRATION,
        );
      },
    );
  }

  async createUser(requestData: CreateUserRequestDto, createdRole: string) {
    const context = `${UserService.name}.${this.createUser.name}`;

    // Check if role exists
    const role = await this.roleRepository.findOne({
      where: {
        slug: requestData.role,
      },
    });
    if (!role) {
      this.logger.error(`Role is not found`, null, context);
      throw new RoleException(RoleValidation.ROLE_NOT_FOUND);
    }

    // Check phone number uniqueness
    const userExists = await this.userRepository.findOne({
      where: {
        phonenumber: requestData.phonenumber,
      },
    });
    if (userExists) {
      this.logger.error(`User already exists`, null, context);
      throw new AuthException(AuthValidation.USER_EXISTS);
    }

    const user = this.mapper.map(requestData, CreateUserRequestDto, User);

    const hashedPass = await bcrypt.hash(
      requestData.password,
      this.saltOfRounds,
    );
    Object.assign(user, {
      password: hashedPass,
      role,
    });

    if (requestData.branch) {
      const branch = await this.branchRepository.findOne({
        where: {
          slug: requestData.branch,
        },
      });
      if (!branch) throw new BranchException(BranchValidation.BRANCH_NOT_FOUND);
      user.branch = branch;
    }

    if (createdRole == RoleEnum.Admin || createdRole == RoleEnum.SuperAdmin) {
      user.isVerifiedPhonenumber = requestData.isVerifiedPhonenumber ?? false;
    } else {
      user.isVerifiedPhonenumber = false;
    }

    try {
      const blockedPhonenumberRequirement = new UserRequirement();
      blockedPhonenumberRequirement.key =
        UserRequirementKey.NEED_UPDATE_PHONE_NUMBER;
      blockedPhonenumberRequirement.status = UserRequirementStatus.COMPLETED;
      blockedPhonenumberRequirement.level = UserRequirementLevel.BLOCK;
      blockedPhonenumberRequirement.scope = UserRequirementScope.INITIAL;

      const blockedPasswordRequirement = new UserRequirement();
      blockedPasswordRequirement.key = UserRequirementKey.NEED_UPDATE_PASSWORD;
      blockedPasswordRequirement.status = UserRequirementStatus.COMPLETED;
      blockedPasswordRequirement.level = UserRequirementLevel.BLOCK;
      blockedPasswordRequirement.scope = UserRequirementScope.INITIAL;

      user.userRequirements = [
        blockedPhonenumberRequirement,
        blockedPasswordRequirement,
      ];
      if (requestData.dob) {
        const [day, month] = requestData.dob.split('/');
        user.dobDM = `${day}${month}`;
      }
      const createdUser = await this.userRepository.save(user);
      this.logger.log(`User has been created successfully`, context);

      if (createdUser) {
        this.eventEmitter.emit(CampaignAction.USER_CREATED, {
          user: createdUser,
        });
        if (user.dobDM && this.isTodayBirthday(user.dobDM))
          this.eventEmitter.emit(CampaignAction.USER_BIRTHDAY_TRIGGERED, {
            user,
          });
      }
    } catch (error) {
      this.logger.error(
        `Error when creating user: ${error.message}`,
        error.stack,
        context,
      );
      throw new UserException(UserValidation.ERROR_CREATE_USER);
    }

    return this.mapper.map(user, User, UserResponseDto);
  }

  async updateUserRole(slug: string, requestData: UpdateUserRoleRequestDto) {
    const context = `${UserService.name}.${this.updateUserRole.name}`;
    const role = await this.roleRepository.findOne({
      where: {
        slug: requestData.role,
      },
    });
    if (!role) throw new RoleException(RoleValidation.ROLE_NOT_FOUND);

    const user = await this.userRepository.findOne({
      where: { slug },
      relations: ['role'],
    });
    if (!user) throw new UserException(UserValidation.USER_NOT_FOUND);

    if (user.role.name === RoleEnum.Customer) {
      this.logger.warn(
        `Can not update customer role to ${role.name} role`,
        context,
      );
      throw new UserException(UserValidation.CANNOT_UPDATE_CUSTOMER_ROLE);
    }

    try {
      user.role = role;
      await this.userRepository.save(user);
      this.logger.log(`User role has been updated successfully`, context);
    } catch (error) {
      this.logger.error(
        `Error when updating user role: ${error.message}`,
        error.stack,
        context,
      );
    }

    return this.mapper.map(user, User, UserResponseDto);
  }

  async resetPassword(slug: string) {
    const context = `${UserService.name}.${this.resetPassword.name}`;
    const user = await this.userRepository.findOne({
      where: { slug },
    });
    if (!user) throw new UserException(UserValidation.USER_NOT_FOUND);

    const newPassword = Math.random().toString(36).slice(-8);
    const hashedPass = await bcrypt.hash(newPassword, this.saltOfRounds);

    user.password = hashedPass;
    await this.userRepository.save(user);
    this.logger.log(`User password reset for ${user.email}`, context);

    this.mailService.sendNewPassword(user, newPassword);
  }

  async getAllUsers(
    query: GetAllUserQueryRequestDto,
  ): Promise<AppPaginatedResponseDto<UserResponseDto>> {
    // Construct where options
    const whereOptions: FindOptionsWhere<User> = {};
    if (query.slug) whereOptions.slug = query.slug;
    if (query.branch) whereOptions.branch = { slug: query.branch };
    if (query.phonenumber)
      whereOptions.phonenumber = Like(`%${query.phonenumber}%`);
    if (!_.isEmpty(query.role))
      whereOptions.role = {
        name: In(query.role),
      };

    if (query.membershipCard) {
      whereOptions.membershipCard = {
        code: query.membershipCard,
      };
    }

    // Construct find many options
    const findManyOptions: FindManyOptions<User> = {
      relations: {
        branch: true,
        role: true,
        accumulatedPoint: true,
        membershipCard: true,
        userRequirements: true,
      },
      where: whereOptions,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    };
    if (query.hasPaging) {
      findManyOptions.skip = (query.page - 1) * query.size;
      findManyOptions.take = query.size;
    }

    // Exec query
    const [users, total] =
      await this.userRepository.findAndCount(findManyOptions);

    // Calculate total pages
    const page = query.hasPaging ? query.page : 1;
    const pageSize = query.hasPaging ? query.size : total;
    const totalPages = Math.ceil(total / pageSize);

    // Determine hasNext and hasPrevious
    const hasNext = page < totalPages;
    const hasPrevious = page > 1;

    return {
      hasNext: hasNext,
      hasPrevios: hasPrevious,
      items: this.mapper.mapArray(users, User, UserResponseDto),
      total,
      page,
      pageSize,
      totalPages,
    } as AppPaginatedResponseDto<UserResponseDto>;
  }

  async toggleActiveUser(slug: string) {
    const context = `${UserService.name}.${this.toggleActiveUser.name}`;
    const user = await this.userRepository.findOne({
      where: { slug },
    });
    if (!user) {
      this.logger.warn(`User ${slug} not found`, context);
      throw new UserException(UserValidation.USER_NOT_FOUND);
    }

    user.isActive = !user.isActive;
    await this.userRepository.save(user);
    this.logger.log(`User ${slug} active status has been toggled`, context);
    return this.mapper.map(user, User, UserResponseDto);
  }

  async updateUserLanguage(
    userId: string,
    requestData: UpdateUserLanguageRequestDto,
  ) {
    const context = `${UserService.name}.${this.updateUserLanguage.name}`;
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      this.logger.warn(`User ${userId} not found`, context);
      throw new UserException(UserValidation.USER_NOT_FOUND);
    }
    user.language = requestData.language;
    await this.userRepository.save(user);
    this.logger.log(`User ${user.slug} language has been updated`, context);
    return this.mapper.map(user, User, AuthProfileResponseDto);
  }
}
