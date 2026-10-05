import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import {
  FindManyOptions,
  FindOptionsWhere,
  In,
  Like,
  Repository,
} from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { User } from './user.entity';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  CompleteUserRegistrationRequestDto,
  CreateUserRequestDto,
  GetAllUserQueryRequestDto,
  LookupRecipientQueryRequestDto,
  RecipientResponseDto,
  UpdateUserLanguageRequestDto,
  UpdateUserRequestDto,
  UpdateUserRoleRequestDto,
  UserResponseDto,
} from './user.dto';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { MailService } from 'src/mail/mail.service';
import { ConfigService } from '@nestjs/config';
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
  LOOKUP_ON_MISS_PHONENUMBER_PATTERN,
  LOOKUP_ON_MISS_TIMEOUT_MS,
  SYNC_RECENT_USERS_THROTTLE_KEY,
  SYNC_RECENT_USERS_THROTTLE_SECONDS,
  SYNC_RECENT_USERS_TIMEOUT_MS,
  SYNC_RECENT_USERS_WINDOW_MINUTES,
  UserRequirementKey,
  UserRequirementLevel,
  UserRequirementScope,
  UserRequirementStatus,
} from './user.constant';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { UserRequirement } from './user-requirement.entity';
import { CampaignAction } from 'src/campaign/campaign.constants';
import { QueueRegisterKey } from 'src/app/app.constants';
import {
  SharedUserLookupResponse,
  SharedUserServiceClient,
} from 'src/external-services/shared-user-service/shared-user-service.client';
import { UserProvisioningService } from './user-provisioning.service';
// Dung lai helper da co thay vi viet lai literal 'default-customer' - xem
// lookupRecipient rang buoc 4a.
import { isDefaultCustomer } from 'src/accumulated-point/accumulated-point.utils';

// Ma loi `USER_NOT_FOUND` cua `shared-user` (user.validation.ts: 137000) -
// nam trong BODY, HTTP status la 400. Xem toSharedUserCommandError.
//
// Trung dung gia tri ma `terminal` cung dung cho `USER_NOT_FOUND`, vi ca hai
// service chia cung dai ma 137000-138000 cho module `user`.
const SHARED_USER_USER_NOT_FOUND_CODE = 137000;

@Injectable()
export class UserService {
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
    private readonly sharedUserServiceClient: SharedUserServiceClient,
    // QD19 - MOT duong tao hang user cuc bo dung chung cho ca bon lop.
    private readonly userProvisioningService: UserProvisioningService,
    // Dung lai Redis da co san cho Redlock, chi de lam throttle cua lop 1
    // (khoa RIENG, khong dung chung voi khoa cua cron - xem QD21).
    @InjectQueue(QueueRegisterKey.DISTRIBUTE_LOCK_JOB)
    private readonly distributeLockJobQueue: Queue,
  ) {}

  // Ghep field identity moi nhat tu shared-user vao 1 UserResponseDto da map
  // tu entity cuc bo - dung cho cac endpoint "can du lieu ca 2 ben"
  // (architect-http.md muc 1.1 quy tac 4): role/branch/sharedUserId lay tu
  // terminal, identity lay tu shared-user thay vi cache cuc bo co the cu.
  private mergeSharedUserIdentity(
    dto: UserResponseDto,
    identity: {
      phonenumber?: string;
      firstName?: string;
      lastName?: string;
      dob?: string;
      email?: string;
      address?: string;
      isVerifiedEmail?: boolean;
      isVerifiedPhonenumber?: boolean;
      isActive?: boolean;
    } | null,
  ): UserResponseDto {
    // `isActive` gan RIENG va gan LUON, ke ca khi khong co identity - KHONG
    // duoc rot ve `dto.isActive`.
    //
    // Khoa/mo khoa tai khoan quy het ve shared-user (architect-http.md muc
    // 1.1), nen cot `is_active_column` ben terminal la du lieu chet: khong
    // con ai ghi vao no, mac dinh `true`, va se bi xoa o giai doan sau. Lay
    // no lam gia tri du phong nghia la tra ve "dang hoat dong" cho ca tai
    // khoan vua bi khoa.
    //
    // Khong co identity => `false`. Day khong phai gia tri an toan tuy tien
    // ma la su that: khong co ban ghi ben shared-user thi tai khoan do khong
    // xac thuc duoc (JwtStrategy tra theo sharedUserId roi chan neu khong
    // thay), nen "khong dung duoc" mo ta dung trang thai cua no.
    dto.isActive = identity?.isActive ?? false;
    if (!identity) return dto;
    return Object.assign(dto, {
      phonenumber: identity.phonenumber ?? dto.phonenumber,
      firstName: identity.firstName ?? dto.firstName,
      lastName: identity.lastName ?? dto.lastName,
      dob: identity.dob ?? dto.dob,
      email: identity.email ?? dto.email,
      address: identity.address ?? dto.address,
      isVerifiedEmail: identity.isVerifiedEmail ?? dto.isVerifiedEmail,
      isVerifiedPhonenumber:
        identity.isVerifiedPhonenumber ?? dto.isVerifiedPhonenumber,
    });
  }

  // Rollback (architect-http.md muc 1.2 buoc 3): goi lai updateIdentity voi
  // gia tri CU de bu tru khi buoc ghi cuc bo o terminal that bai sau khi
  // shared-user da ghi thanh cong. Neu chinh lan goi rollback nay cung loi,
  // log o muc critical kem du context (sharedUserId, gia tri cu/moi that
  // bai) de xu ly thu cong - day la truong hop du lieu lech that su, khong
  // tu phuc hoi duoc.
  private async rollbackSharedUserIdentity(
    sharedUserId: string,
    oldValues: Record<string, unknown>,
    attemptedValues: Record<string, unknown>,
    context: string,
  ): Promise<void> {
    try {
      await this.sharedUserServiceClient.updateIdentity(
        sharedUserId,
        oldValues,
      );
      this.logger.warn(
        `Rolled back shared-user identity for sharedUserId ${sharedUserId} after local save failure`,
        context,
      );
    } catch (rollbackError) {
      this.logger.error(
        `CRITICAL: failed to rollback shared-user identity for sharedUserId ${sharedUserId} after local save failure - data is now OUT OF SYNC between terminal and shared-user. Attempted new values: ${JSON.stringify(
          attemptedValues,
        )}. Intended rollback to: ${JSON.stringify(oldValues)}. Rollback error: ${rollbackError?.message}`,
        rollbackError?.stack,
        context,
      );
    }
  }

  // Rollback (architect-http.md muc 1.2 buoc 3) cho duong TAO user - khac
  // rollbackSharedUserIdentity o cho khong co "gia tri cu" de ghi de, vi
  // truoc buoc tao thi ben shared-user chua co gi. Bu tru dung nghia o day
  // la huy identity vua tao (tra lai so dien thoai + tat isActive).
  private async rollbackSharedUserCreate(
    sharedUserId: string,
    phonenumber: string,
    context: string,
  ): Promise<void> {
    try {
      await this.sharedUserServiceClient.revertCreatedUser(sharedUserId);
      this.logger.warn(
        `Rolled back shared-user identity ${sharedUserId} after local save failure`,
        context,
      );
    } catch (rollbackError) {
      this.logger.error(
        `CRITICAL: failed to roll back shared-user identity ${sharedUserId} (phonenumber ${phonenumber}) after local save failure - the identity now EXISTS on shared-user with no matching row on terminal. Manual cleanup required (revert or delete it) before this phonenumber can be used again. Rollback error: ${rollbackError?.message}`,
        rollbackError?.stack,
        context,
      );
    }
  }

  // Doi loi cua lenh GHI `resetPassword` / `toggleActive` sang loi ma
  // `HttpExceptionFilter` bat duoc. Client co tinh KHONG boc hai lenh nay qua
  // `toReadError`, nen neu nem nguyen loi axios thi no roi xuong bo xu ly mac
  // dinh cua Nest va ra 500.
  //
  // `shared-user` bao "khong co user" bang HTTP 400 kem ma nghiep vu 137000
  // trong body (AppException mac dinh 400), khong phai 404 - nen phai doc ma
  // trong body. 404 giu lai phong khi ben kia doi sang tra dung status. Moi
  // thu khac = shared-user khong thi hanh duoc lenh => 503.
  private toSharedUserCommandError(error: unknown, context: string): never {
    const response = (
      error as {
        response?: { status?: number; data?: { statusCode?: number } };
      }
    )?.response;
    if (
      response?.status === 404 ||
      response?.data?.statusCode === SHARED_USER_USER_NOT_FOUND_CODE
    ) {
      throw new UserException(UserValidation.USER_NOT_FOUND);
    }
    this.logger.error(
      `shared-user command failed: ${(error as Error)?.message}`,
      (error as Error)?.stack,
      context,
    );
    throw new ServiceUnavailableException();
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

    const dto = this.mapper.map(user, User, UserResponseDto);
    // Fail-closed: goi hong thi tra 503, KHONG rot ve ban cuc bo. Ban cuc bo
    // khong con `isActive` that (xem mergeSharedUserIdentity), nen tra ve no
    // la tra ve so lieu sai duoi vo boc 200. Doi lai gan nhu khong mat tinh
    // san sang nao: JwtStrategy da goi chinh shared-user va nem 503 trong MOI
    // request co auth, nen shared-user chet thi request khong bao gio di toi
    // duoc day.
    let identity: Awaited<ReturnType<SharedUserServiceClient['lookupById']>>;
    try {
      identity = await this.sharedUserServiceClient.lookupById(
        user.sharedUserId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to enrich user identity from shared-user: ${error?.message}`,
        error?.stack,
        context,
      );
      throw new ServiceUnavailableException();
    }

    // Co hang cuc bo nhung shared-user khong co danh tinh => nguoi nay khong
    // thuc su ton tai. Tra "not found" thay vi 200 kem cac field danh tinh
    // rong (architect-http.md muc 1.7: hang cuc bo KHONG phai bang chung ton
    // tai).
    //
    // ⚠️ Voi ~126 hang cuc bo chua co danh tinh ben shared-user (xem ghi chu
    // tai `User.sharedUserId`), nhanh nay se ban ra cho toi khi luot backfill
    // A7-f gan lai `sharedUserId` that. Do la hanh vi DUNG, khong phai loi.
    if (!identity) {
      this.logger.error(
        `Shared-user identity not found for sharedUserId ${user.sharedUserId}`,
        null,
        context,
      );
      throw new UserException(UserValidation.USER_NOT_FOUND);
    }

    return this.mergeSharedUserIdentity(dto, identity);
  }

  // Sua thong tin 1 user (admin-facing). Branch la du lieu cua terminal, sua
  // cuc bo binh thuong. Cac field identity (firstName/lastName/dob/email/
  // address) thuoc ve shared-user (architect-http.md muc 1.1) - phai ghi sang
  // do TRUOC (fail-closed: shared-user tra loi thi moi luu cuc bo, tranh 2
  // ban lech nhau vinh vien neu shared-user tu choi vd trung SDT o noi khac),
  // ket qua tra ve ghep tu response cua chinh lan goi do. Van luu ban sao cuc
  // bo (khong xoa) vi 12 tep / 9 module khac cua terminal van doc truc tiep
  // cot cuc bo cho nghiep vu that cua chung - quyet dinh (A'), xem
  // progress/terminal-api.md.
  //
  // 2 lenh ghi (shared-user + cuc bo) phai la 1 don vi nguyen tu
  // (architect-http.md muc 1.2 - bat buoc): neu buoc luu cuc bo phia duoi
  // that bai SAU KHI shared-user da ghi thanh cong, PHAI goi lai
  // updateIdentity voi gia tri CU de rollback truoc khi bao loi cho client.
  // Gia tri cu duoc snapshot bang 1 lan lookupById NGAY TRUOC KHI ghi (khong
  // dung cot cuc bo lam gia tri cu - cot cuc bo co the da lech vi user co the
  // tu sua qua PATCH {shared-user}/auth/profile, bo qua terminal hoan toan).
  async updateUser(slug: string, requestData: UpdateUserRequestDto) {
    const context = `${UserService.name}.${this.updateUser.name}`;
    const user = await this.userRepository.findOne({
      where: { slug },
      relations: ['branch', 'role'],
    });
    if (!user) throw new UserException(UserValidation.USER_NOT_FOUND);

    const { firstName, lastName, dob, email, address } = requestData;
    const hasIdentityChanges =
      firstName !== undefined ||
      lastName !== undefined ||
      dob !== undefined ||
      email !== undefined ||
      address !== undefined;

    // Goi LUON, ke ca khi request chi doi branch: day vua la ban snapshot gia
    // tri CU phuc vu rollback ben duoi, vua la nguon `isActive` that cho
    // response (cot cuc bo luon `true`, ke ca voi tai khoan da bi khoa).
    let beforeIdentity: Awaited<
      ReturnType<SharedUserServiceClient['lookupById']>
    > | null = null;
    try {
      beforeIdentity = await this.sharedUserServiceClient.lookupById(
        user.sharedUserId,
      );
    } catch (error) {
      this.logger.error(
        `Error snapshotting identity on shared-user before update: ${error.message}`,
        error.stack,
        context,
      );
      throw new AuthException(AuthValidation.ERROR_UPDATE_USER);
    }
    // Chi bat buoc phai co identity khi sap GHI sang shared-user (can gia tri
    // cu de rollback). Duong chi doi branch van chay tiep duoc voi
    // beforeIdentity = null: khi do mergeSharedUserIdentity se tra
    // `isActive: false`, dung voi 1 hang khong con danh tinh ben shared-user.
    if (hasIdentityChanges && !beforeIdentity) {
      this.logger.error(
        `Shared-user identity not found for sharedUserId ${user.sharedUserId} before update`,
        null,
        context,
      );
      throw new AuthException(AuthValidation.USER_NOT_FOUND);
    }

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

    // `'dob' in requestData` chu KHONG phai `if (requestData.dob)`: phai phan
    // biet "khong gui truong nay" voi "gui null de XOA ngay sinh". Dung dieu
    // kien truthy thi lenh xoa ngay sinh chi xoa `dob`, con `dobDM` GIU NGUYEN
    // gia tri cu - ma `campaign/campaign.scheduler.ts` loc chien dich sinh nhat
    // dung bang `dobDM`, nen khach da xoa ngay sinh van nhan chien dich vao
    // ngay cu, mai mai. `trend` da vap va sua dung cho nay
    // (trend/.../user/user.service.ts:322).
    if ('dob' in requestData) {
      const [day, month] = requestData.dob ? requestData.dob.split('/') : [];
      user.dobDM = day && month ? `${day}${month}` : null;
    }

    let identity: Awaited<
      ReturnType<SharedUserServiceClient['updateIdentity']>
    > | null = null;
    if (hasIdentityChanges) {
      try {
        identity = await this.sharedUserServiceClient.updateIdentity(
          user.sharedUserId,
          { firstName, lastName, dob, email, address },
        );
      } catch (error) {
        this.logger.error(
          `Error updating identity on shared-user: ${error.message}`,
          error.stack,
          context,
        );
        if (error?.response?.status === 409) {
          throw new AuthException(AuthValidation.USER_EXISTS);
        }
        throw new AuthException(AuthValidation.ERROR_UPDATE_USER);
      }
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
      const dto = this.mapper.map(updatedUser, User, UserResponseDto);
      // Duong chi doi branch khong goi updateIdentity nen `identity` la null -
      // khi do dung ban snapshot vua lay o tren. Luon phai merge, vi
      // `isActive` cua dto la cot cuc bo (du lieu chet, luon `true`).
      return this.mergeSharedUserIdentity(dto, identity ?? beforeIdentity);
    } catch (error) {
      this.logger.error(
        `Error when updating user locally after shared-user identity update: ${error.message}`,
        error.stack,
        context,
      );
      if (identity && beforeIdentity) {
        await this.rollbackSharedUserIdentity(
          user.sharedUserId,
          {
            firstName: beforeIdentity.firstName,
            lastName: beforeIdentity.lastName,
            dob: beforeIdentity.dob,
            email: beforeIdentity.email,
            address: beforeIdentity.address,
          },
          { firstName, lastName, dob, email, address },
          context,
        );
      }
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

    // Dung de rollback shared-user (architect-http.md muc 1.2 buoc 3) neu
    // buoc luu cuc bo o duoi that bai sau khi da doi SDT thanh cong ben
    // shared-user. Chi set khi thuc su da ghi thanh cong sang shared-user.
    let oldPhonenumberForRollback: string | null = null;

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
        // Phonenumber la login key that su - thuoc ve shared-user
        // (architect-http.md muc 1.1). Ghi sang do TRUOC (fail-closed: neu
        // shared-user tu choi - vd 409 vi da bi nguoi khac chiem giua luc
        // check cuc bo va luc goi - thi khong duoc luu ban cuc bo, tranh 2
        // ben lech nhau). Check cuc bo o tren chi la fast-fail, khong phai
        // nguon that.
        const oldPhonenumber = user.phonenumber;
        try {
          await this.sharedUserServiceClient.updateIdentity(user.sharedUserId, {
            phonenumber: requestData.phonenumber,
          });
        } catch (error) {
          this.logger.error(
            `Error updating phonenumber on shared-user: ${error.message}`,
            error.stack,
            context,
          );
          if (error?.response?.status === 409) {
            throw new AuthException(AuthValidation.PHONE_NUMBER_ALREADY_EXISTS);
          }
          throw new AuthException(
            AuthValidation.ERROR_COMPLETE_USER_REGISTRATION,
          );
        }
        // Da ghi thanh cong sang shared-user - tu day tro di neu buoc luu cuc
        // bo phia duoi that bai, PHAI rollback ve SDT cu nay.
        oldPhonenumberForRollback = oldPhonenumber;
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

    // Truoc day cho nay tu bat lai `user.isActive = true`. Da go: tu dot
    // "khoa tai khoan quy han ve shared-user" (architect-http.md muc 1.1),
    // cot cuc bo nay khong con ai doc, va viec ghi vao no KHONG mo khoa tai
    // khoan that - trang thai that nam ben shared-user.
    //
    // Neu nghiep vu THAT SU can "hoan tat dang ky thi mo khoa lai tai khoan",
    // phai lam bang mot duong ghi sang shared-user va tuan theo muc 1.2 -
    // hien `POST /internal/users/:id/update-identity` khong nhan `isActive`,
    // nen day la viec can quyet dinh rieng, khong phai sua tien tay o day.

    try {
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
    } catch (error) {
      // Rollback (architect-http.md muc 1.2 buoc 3): shared-user da doi SDT
      // thanh cong nhung buoc luu cuc bo that bai - phai tra SDT ve gia tri
      // cu ben shared-user, khong duoc de 2 ben lech nhau.
      if (oldPhonenumberForRollback) {
        await this.rollbackSharedUserIdentity(
          user.sharedUserId,
          { phonenumber: oldPhonenumberForRollback },
          { phonenumber: requestData.phonenumber },
          context,
        );
      }
      throw error;
    }
  }

  // Tao user moi: terminal quyet dinh role/branch (nghiep vu cua no), sau do
  // goi noi bo sang shared-user de luu lai identity (phonenumber, mat khau,
  // ho ten...) - dao nguoc thu tu so voi truoc khi tach (khi do terminal tu
  // luu het, tu hash mat khau). Validate role/branch/trung SDT truoc khi goi
  // sang shared-user de khong tao "rac" ben do neu request sai ngay tu dau.
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

    // Check phone number uniqueness - fast-fail cuc bo. Nguon that cua viec
    // chong trung SDT nam o shared-user (UNIQUE tren cot cua no).
    const userExists = await this.userRepository.findOne({
      where: {
        phonenumber: requestData.phonenumber,
      },
    });
    if (userExists) {
      this.logger.error(`User already exists`, null, context);
      throw new AuthException(AuthValidation.USER_EXISTS);
    }

    let branch: Branch | undefined;
    if (requestData.branch) {
      branch = await this.branchRepository.findOne({
        where: {
          slug: requestData.branch,
        },
      });
      if (!branch) throw new BranchException(BranchValidation.BRANCH_NOT_FOUND);
    }

    let sharedUser: Awaited<ReturnType<SharedUserServiceClient['createUser']>>;
    try {
      sharedUser = await this.sharedUserServiceClient.createUser({
        phonenumber: requestData.phonenumber,
        // Mat khau di NGUYEN VAN sang shared-user - chinh no hash. terminal
        // khong con hash/luu mat khau: cot `password_column` cuc bo nay
        // nullable va khong ai doc nua.
        password: requestData.password,
        firstName: requestData.firstName,
        lastName: requestData.lastName,
        dob: requestData.dob,
        // Giu nguyen luat cua terminal: chi Admin/SuperAdmin duoc danh dau da
        // xac minh SDT ho nguoi khac.
        isVerifiedPhonenumber:
          createdRole === RoleEnum.Admin || createdRole === RoleEnum.SuperAdmin
            ? (requestData.isVerifiedPhonenumber ?? false)
            : false,
        // ==================================================================
        // QD18 - DAY LA CHO DUY NHAT `terminal` DICH ROLE CUA NO THANH CO
        // TRUNG TINH. Giu no o mot cho, dung rai.
        //
        // `terminal` khai bao: role dung chung cua no la `Customer`. Moi role
        // khac la nhan vien/hang he thong => rieng cua terminal.
        //
        // Cot dich (`owner_service`) la cot BAT BIEN, khong co duong thang
        // 'terminal' -> NULL. Gui `false` nham cho mot khach that la khoa
        // cung ho vao rieng terminal VINH VIEN. Xem architect-http.md muc 1.1
        // quy tac 6.
        //
        // KHONG gui `role` (QD15): hai service co hai he phan quyen DOC LAP.
        // ==================================================================
        isShared: role.name === RoleEnum.Customer,
      });
    } catch (error) {
      this.logger.error(
        `Error when creating identity on shared-user: ${error.message}`,
        error.stack,
        context,
      );
      if (error?.response?.status === 400 || error?.response?.status === 409) {
        throw new AuthException(AuthValidation.USER_EXISTS);
      }
      throw error;
    }

    // QD19 - UPSERT, khong phai insert thuan. Giua hai buoc cua chinh lenh
    // nay (tao identity o tren, luu hang cuc bo o duoi), lop 1 (sync-on-read)
    // hoac lop 3 (cron) co the da keo dung nguoi vua tao ve va ghi mot hang
    // cuc bo voi role `Customer` mac dinh. Insert thuan se vap unique
    // constraint va bao loi cho nguoi bam nut - trong khi that ra moi thu deu
    // on.
    //
    // `provisionedByAnotherLayer` con dung o nhanh rollback: neu hang cuc bo
    // do LOP KHAC tao chu khong phai lenh nay, thi huy danh tinh la SAI - chi
    // huy khi chinh lenh nay vua tao ra no (muc 1.2).
    const existedLocalUser = await this.userRepository.findOne({
      where: { sharedUserId: sharedUser.id },
      relations: ['userRequirements'],
    });
    const provisionedByAnotherLayer = !!existedLocalUser;

    const user =
      existedLocalUser ??
      this.mapper.map(requestData, CreateUserRequestDto, User);
    // Y dinh cua lenh tao thang ban role mac dinh ma lop khac vua gan.
    Object.assign(user, {
      phonenumber: sharedUser.phonenumber,
      sharedUserId: sharedUser.id,
      role,
    });
    user.branch = branch;

    try {
      // UserRequirement chi gan khi chinh lenh nay tao hang - hang do lop
      // khac cap (role Customer) da co bo requirement rieng cua no, ghi de la
      // tao ban trung.
      if (!provisionedByAnotherLayer) {
        const blockedPhonenumberRequirement = new UserRequirement();
        blockedPhonenumberRequirement.key =
          UserRequirementKey.NEED_UPDATE_PHONE_NUMBER;
        blockedPhonenumberRequirement.status = UserRequirementStatus.COMPLETED;
        blockedPhonenumberRequirement.level = UserRequirementLevel.BLOCK;
        blockedPhonenumberRequirement.scope = UserRequirementScope.INITIAL;

        const blockedPasswordRequirement = new UserRequirement();
        blockedPasswordRequirement.key =
          UserRequirementKey.NEED_UPDATE_PASSWORD;
        blockedPasswordRequirement.status = UserRequirementStatus.COMPLETED;
        blockedPasswordRequirement.level = UserRequirementLevel.BLOCK;
        blockedPasswordRequirement.scope = UserRequirementScope.INITIAL;

        user.userRequirements = [
          blockedPhonenumberRequirement,
          blockedPasswordRequirement,
        ];
      }
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
      const dto = this.mapper.map(createdUser, User, UserResponseDto);
      // Ghep identity tu chinh response tao user ben shared-user - khong goi
      // lookup lan thu hai (architect-http.md muc 1.1 quy tac 4).
      return this.mergeSharedUserIdentity(dto, sharedUser);
    } catch (error) {
      this.logger.error(
        `Error when creating user: ${error.message}`,
        error.stack,
        context,
      );
      // Rollback (architect-http.md muc 1.2 buoc 3): identity da duoc tao ben
      // shared-user o tren, buoc ghi cuc bo vua that bai - phai bu tru ngay.
      // Neu khong bu tru, so dien thoai do bi giu vinh vien ben shared-user va
      // admin khong bao gio tao lai duoc user nay (lan sau se dinh
      // USER_EXISTS tu chinh shared-user).
      if (provisionedByAnotherLayer) {
        // Hang cuc bo do LOP KHAC cua QD19 tao ra, khong phai lenh nay - huy
        // danh tinh o shared-user la xoa mat mot nguoi dung that. Chi bao loi,
        // khong bu tru.
        this.logger.warn(
          `Local user for sharedUserId=${sharedUser.id} was provisioned by another layer; skip identity rollback`,
          context,
        );
      } else {
        await this.rollbackSharedUserCreate(
          sharedUser.id,
          requestData.phonenumber,
          context,
        );
      }
      throw new UserException(UserValidation.ERROR_CREATE_USER);
    }
  }

  // Gan role cho 1 user. Nhan `slug` CUC BO (khac `trend`, ben do nhan
  // `phonenumber` trong body) - UI lay slug thang tu danh sach no da co, nen
  // khong co duong tra nguoc slug bang khop chuoi con (rui ro R6).
  //
  // KHONG ghi gi sang shared-user: role la nghiep vu RIENG cua terminal
  // (QD15), shared-user co bang role doc lap cua chinh no.
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

    if (user.role?.name === RoleEnum.Customer) {
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
      throw error;
    }

    const dto = this.mapper.map(user, User, UserResponseDto);
    // Ghep identity - hang cuc bo co the da cu (nguoi dung tu sua ho so thang
    // ben shared-user). Fail-closed nhu getUserBySlug.
    let identity: Awaited<ReturnType<SharedUserServiceClient['lookupById']>>;
    try {
      identity = await this.sharedUserServiceClient.lookupById(
        user.sharedUserId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to enrich user identity from shared-user: ${error?.message}`,
        error?.stack,
        context,
      );
      throw new ServiceUnavailableException();
    }
    return this.mergeSharedUserIdentity(dto, identity);
  }

  /**
   * QD16 - dat lai mat khau cho mot tai khoan, va **cua kiem quyen dat o day**.
   *
   * ### Vi sao route nay o `terminal` chu khong o `shared-user`
   *
   * *Dat lai mat khau can quyen cua NGUOI RA QUYET DINH, ma quyen do nam o
   * `terminal`.* Ai duoc phep dat lai mat khau cua nguoi khac la cau hoi ve
   * **chuc vu trong cua hang** (Manager/Admin/SuperAdmin) - du kien ay chi
   * `terminal` giu dung. De `shared-user` tu tra loi la bat no doan bang mot
   * ban role khong ai cap nhat, va do chinh la co che sinh ra **R1** ma
   * `trend` mat mot dot moi dong lai duoc: admin vua duoc cap quyen qua
   * `POST {terminal}/user/:slug/role` bi **403 oan**. `terminal` dat cua kiem
   * quyen dung cho ngay tu dau.
   *
   * Nhan `slug` CUC BO - UI lay thang tu danh sach no da co. `terminal`
   * KHONG con tu sinh mat khau, tu hash, tu gui mail: ca ba viec do thuoc
   * shared-user.
   */
  async resetPassword(slug: string) {
    const context = `${UserService.name}.${this.resetPassword.name}`;
    const user = await this.userRepository.findOne({
      where: { slug },
    });
    if (!user) throw new UserException(UserValidation.USER_NOT_FOUND);

    try {
      await this.sharedUserServiceClient.resetPassword(user.sharedUserId);
    } catch (error) {
      this.toSharedUserCommandError(error, context);
    }
    this.logger.log(
      `Password reset requested for user ${slug} (sharedUserId=${user.sharedUserId})`,
      context,
    );
  }

  /**
   * QD19 LOP 1 - sync-on-read.
   *
   * Keo user tao ben `shared-user` trong 15 phut gan nhat ve va tao hang cuc
   * bo cho ai chua co, **truoc khi** chay truy van cuc bo.
   *
   * ### Vi sao phai co, noi cho dung
   * `getAllUsers` chi doc `user_tbl` cuc bo. Khach tu dang ky qua
   * `shared-user` ma chua tung dang nhap vao `terminal` thi **nhan vien tra
   * khong ra**. Va o day khong phai "man hinh xem cho vui": chinh
   * `getAllUsers` la thu bon O TIM KHACH dang dung (gio hang ban tai quay,
   * thanh toan, nguoi nhan the qua, quet RFID, cac dialog gan the/nhom
   * khach). Va lop 3 la cron, tot nhat cung tre 10 phut - day la nhip bu cho
   * khe do.
   *
   * ### Bon dieu kien, thieu cai nao cung hong
   *
   * 1. **THROTTLE 60 GIAY - quan trong hon ca timeout.** O tim khach co
   *    debounce: go mot so dien thoai van ra 3-5 luot goi, nhan voi nhieu may
   *    o quay gio cao diem la mot dong request deu dan chi de nghe "khong co
   *    ai moi". `SET NX EX` tren Redis => dung 1 luot/60 giay cho TOAN CUM.
   * 2. **Timeout ngan.** Day la duong nguoi dung dang cho go, khong phai lenh
   *    goi nen - 2 giay la tran.
   * 3. **FAIL-OPEN.** Goi hong/timeout => bo qua, tra ket qua cuc bo, log
   *    `warn`. KHONG nem loi len.
   * 4. **Dung lai `ensureLocalUser`** (khong viet vong insert thu hai) va
   *    **loc `ownerService`** (khong keo nhan vien cua service khac ve).
   *
   * > ### Muc 3 la NGOAI LE CO CHU DICH cua muc 1.7
   * > Moi duong khac quy loi `shared-user` thanh **503**. Cho nay co y khong,
   * > vi no chi la nhip bu them, khong phai nguon du lieu chinh cua response.
   * > **Ghi ro de lan ra sau khong ai "sua cho nhat quan".**
   *
   * Mot tinh chat tot, dang ghi: dong bo **theo thoi gian tao**, khong theo
   * chuoi dang tim. Nen go nham so **khong de ra hang rac**.
   */
  private async syncRecentSharedUsersOnRead(): Promise<void> {
    const context = `${UserService.name}.${this.syncRecentSharedUsersOnRead.name}`;
    try {
      const redis = await this.distributeLockJobQueue.client;
      // `SET NX EX` la mot lenh nguyen tu: ai set duoc thi nguoi do chay.
      // Co tinh KHONG dung chung khoa Redlock voi cron (QD21) - dung chung
      // thi lop 1 chan duoc cron va nguoc lai, bien hai co che doc lap thanh
      // phu thuoc nhau, va luc dieu tra su co se khong con suy luan duoc "ai
      // da chay, ai bi bo". Chay trung vai luot la VO HAI (idempotent).
      const acquired = await redis.set(
        SYNC_RECENT_USERS_THROTTLE_KEY,
        '1',
        'EX',
        SYNC_RECENT_USERS_THROTTLE_SECONDS,
        'NX',
      );
      if (!acquired) return;

      const now = new Date();
      const from = new Date(
        now.getTime() - SYNC_RECENT_USERS_WINDOW_MINUTES * 60 * 1000,
      );
      const recent = await this.sharedUserServiceClient.listRecent(from, now, {
        timeout: SYNC_RECENT_USERS_TIMEOUT_MS,
      });
      if (!recent.length) return;

      const { created, skippedForeign } =
        await this.userProvisioningService.ensureLocalUsers(recent);
      if (created || skippedForeign) {
        this.logger.log(
          `Sync-on-read provisioned ${created} local user(s), skipped ${skippedForeign} owned by another service`,
          context,
        );
      }
    } catch (error) {
      // FAIL-OPEN co chu dich - xem ghi chu tren dau ham.
      this.logger.warn(
        `Sync-on-read skipped, falling back to local data only: ${error.message}`,
        context,
      );
    }
  }

  /**
   * QD19 LOP 1b - tra DUNG SDT khi tim cuc bo ra rong.
   *
   * Tra `true` khi da co hang cuc bo khop dung so vua go (ben goi truy van
   * lai), `false` o moi truong hop con lai.
   *
   * ### Vi sao phai co, khi da co sync-on-read
   * Sync-on-read chon nguoi **theo thoi gian** va bi throttle 60 giay toan
   * cum, nen van co khe: khach vua dang ky tren app, ra quay ngay, nhan vien
   * go so dung luc luot sync bi throttle (hoac `list-recent` timeout) =>
   * rong. Nhan vien bam "Tao khach moi" thi `POST /user` bao `USER_EXISTS` vi
   * so da co ben shared-user - ket o ca hai dau. Day la thao tac o quay tan
   * suat cao nhat.
   *
   * ### Dieu kien, thieu cai nao cung hong
   *
   * 1. **Chi khi rong va go DU so** (`LOOKUP_ON_MISS_PHONENUMBER_PATTERN`).
   *    Co ket qua => khong goi gi. Go do dang => khong goi.
   * 2. **Loc role cua request phai chua `Customer`** (neu co loc): hang moi
   *    luon la Customer, truy van lai voi loc role khac cung khong ra.
   * 3. **Timeout ngan, FAIL-OPEN** - cung ngoai le co chu dich cua muc 1.7.
   * 4. **Loc `ownerService`** (QD18) truoc, roi **dung lai `ensureLocalUser`**.
   *
   * KHONG throttle: no chi chay khi rong + du so, moi luot la mot lookup khop
   * tuyet doi theo khoa. Throttle o day lai mo lai dung khe dang va.
   */
  private async provisionByExactPhonenumberOnMiss(
    query: GetAllUserQueryRequestDto,
  ): Promise<boolean> {
    const context = `${UserService.name}.${this.provisionByExactPhonenumberOnMiss.name}`;

    const phonenumber = query.phonenumber?.trim();
    if (!phonenumber || !LOOKUP_ON_MISS_PHONENUMBER_PATTERN.test(phonenumber))
      return false;
    if (!_.isEmpty(query.role) && !query.role.includes(RoleEnum.Customer))
      return false;

    try {
      const sharedUser = await this.sharedUserServiceClient.lookupByPhonenumber(
        phonenumber,
        { timeout: LOOKUP_ON_MISS_TIMEOUT_MS },
      );
      if (!sharedUser) return false;
      if (
        !this.userProvisioningService.isProvisionable(sharedUser.ownerService)
      )
        return false;

      const local =
        await this.userProvisioningService.ensureLocalUser(sharedUser);

      // Hang cuc bo DA CO tu truoc nhung SDT cuc bo khac SDT that (khach doi
      // so ben shared-user) => truy van lai van rong. Khong tu sua o day (day
      // la duong doc), chi keu len de con dieu tra.
      if (local.phonenumber !== sharedUser.phonenumber) {
        this.logger.warn(
          `Local phonenumber of sharedUserId=${sharedUser.id} is stale, lookup-on-miss cannot surface it`,
          context,
        );
        return false;
      }

      this.logger.log(
        `Lookup-on-miss ensured local user for sharedUserId=${sharedUser.id}`,
        context,
      );
      return true;
    } catch (error) {
      // FAIL-OPEN co chu dich - xem ghi chu tren dau ham.
      this.logger.warn(
        `Lookup-on-miss skipped, falling back to local data only: ${error.message}`,
        context,
      );
      return false;
    }
  }

  /**
   * QD16-bis - duong tra NGUOI NHAN the qua, danh cho tai khoan `Customer`.
   *
   * ### Vi sao co ham nay
   *
   * `GET /user` truoc day **khong co `@HasRoles`** nen bat ky tai khoan dang
   * nhap nao, ke ca `Customer`, cung list duoc toan bo khach kem SDT / ho ten
   * / email (`RolesGuard` cho qua khi thieu decorator). Nay route do da gac,
   * va **khong nhan `Customer`**.
   *
   * Nhung man KHACH co mot nhu cau that: mua the qua **tang cho nguoi khac**
   * thi phai tra duoc nguoi nhan theo SDT. Nen tach mot duong HEP rieng thay
   * vi noi rong lai cai route quan tri.
   *
   * ### Bon rang buoc, moi cai dong mot thu
   *
   * 1. **Khop TUYET DOI, khong khop chuoi con** - khop chuoi con chinh la rui
   *    ro **R6**. Khong mo lai no o mot cua khac.
   * 2. **Hoi `shared-user` truoc, khong tra cot `phonenumber` cuc bo** (muc
   *    1.3 uu tien `id` + muc 1.6 khong them cho DOC moi vao cot identity cuc
   *    bo). `lookup` cua `shared-user` von da khop tuyet doi.
   * 3. **Toi da MOT nguoi, toi thieu field** - chi `slug` + `phonenumber` +
   *    ho ten. KHONG email / dob / address / role / diem / vi.
   * 4. **Loc ba loai khong phai nguoi nhan hop le:** hang sentinel khach vang
   *    lai, danh tinh **thuoc service khac** (QD18), va nguoi khong phai
   *    `Customer` o `terminal`.
   *
   * ### Co tinh KHONG tao hang cuc bo o day
   *
   * Day la duong DOC ma nguoi goi co the la `Customer` - cho no tao hang la
   * dua cho tai khoan quyen thap nhat mot don bay GHI. Nguoi dang ky o
   * `shared-user` da duoc **QD19 lop 1 + lop 3** keo ve trong <= 10 phut, nen
   * khe bo sot rat hep. Chua co hang cuc bo => tra rong.
   *
   * KHAC lop 1b (`provisionByExactPhonenumberOnMiss` trong getAllUsers): o do
   * duoc tao hang vi route `GET /user` da gac, nguoi goi chac chan la nhan
   * vien. Dung "sua cho nhat quan" hai cho nay.
   */
  async lookupRecipient(
    query: LookupRecipientQueryRequestDto,
  ): Promise<RecipientResponseDto[]> {
    const context = `${UserService.name}.${this.lookupRecipient.name}`;

    // Rang buoc 2: hoi shared-user, khop tuyet doi. Loi mang o day van ra 503
    // theo muc 1.7 - day KHONG phai duong co ngoai le fail-open nhu
    // sync-on-read, vi ket qua chinh cua response den tu lenh goi nay.
    const sharedUser = await this.sharedUserServiceClient.lookupByPhonenumber(
      query.phonenumber,
    );
    if (!sharedUser) return [];

    // Rang buoc 4a: sentinel khach vang lai khong phai mot con nguoi. Dung
    // chung helper `isDefaultCustomer` thay vi viet lai literal.
    if (isDefaultCustomer(sharedUser.phonenumber)) {
      this.logger.warn(
        `Recipient lookup hit the walk-in sentinel, ignored`,
        context,
      );
      return [];
    }

    // Rang buoc 4b: QD18 - danh tinh rieng cua service khac khong duoc lo ra
    // o day, y het cho khong duoc tu cap hang cuc bo.
    if (!this.userProvisioningService.isProvisionable(sharedUser.ownerService))
      return [];

    const local = await this.userRepository.findOne({
      where: { sharedUserId: sharedUser.id },
      relations: ['role'],
    });
    // Chua co ho so o `terminal` => coi nhu khong tim thay.
    if (!local) return [];

    // Rang buoc 4c: chi khach moi nhan the qua qua duong nay.
    if (local.role?.name !== RoleEnum.Customer) return [];

    return [
      {
        slug: local.slug,
        phonenumber: sharedUser.phonenumber,
        firstName: sharedUser.firstName,
        lastName: sharedUser.lastName,
      },
    ];
  }

  async getAllUsers(
    query: GetAllUserQueryRequestDto,
  ): Promise<AppPaginatedResponseDto<UserResponseDto>> {
    // QD19 lop 1. Phai `await` XONG roi moi truy van - khong thi hang vua ghi
    // chua nhin thay duoc va ca nhip bu thanh vo nghia o chinh luot goi nay.
    // Va co tinh KHONG boc chung transaction voi truy van doc ben duoi: ghi
    // phai commit doc lap, boc chung la giu khoa suot thoi gian cho mang.
    await this.syncRecentSharedUsersOnRead();

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
    let [users, total] =
      await this.userRepository.findAndCount(findManyOptions);

    // QD19 lop 1b - rong ma nhan vien da go DU mot SDT: tra dung nguoi do ben
    // shared-user, cap hang cuc bo roi truy van lai. Chi ton chi phi khi
    // KHONG thay; co ket qua thi khong goi gi them.
    if (total === 0 && (await this.provisionByExactPhonenumberOnMiss(query))) {
      [users, total] = await this.userRepository.findAndCount(findManyOptions);
    }

    // Calculate total pages
    const page = query.hasPaging ? query.page : 1;
    const pageSize = query.hasPaging ? query.size : total;
    const totalPages = Math.ceil(total / pageSize);

    // Determine hasNext and hasPrevious
    const hasNext = page < totalPages;
    const hasPrevious = page > 1;

    const items = this.mapper.mapArray(users, User, UserResponseDto);
    // Ghep identity moi nhat tu shared-user vao ca trang danh sach - 1 lan
    // goi BATCH, khong goi lookup rieng theo tung dong (architect-http.md muc
    // 1.1 quy tac 4).
    //
    // Fail-closed, giong getUserBySlug: goi hong thi tra 503 thay vi tra 200
    // kem cot `isActive` cuc bo (luon `true`, ke ca voi tai khoan vua bi
    // khoa).
    try {
      const sharedUserIds = users
        .map((user) => user.sharedUserId)
        .filter(Boolean);
      const identities =
        await this.sharedUserServiceClient.lookupByIds(sharedUserIds);
      const identityById = new Map(
        identities.map((identity) => [identity.id, identity]),
      );
      // Goi merge cho MOI dong, ke ca dong khong tra cuu duoc identity: chinh
      // nhanh `if (identity)` la cho tai khoan bi khoa lot qua voi `isActive`
      // cuc bo con nguyen.
      items.forEach((dto, index) => {
        const identity = identityById.get(users[index].sharedUserId);
        this.mergeSharedUserIdentity(dto, identity ?? null);
      });
    } catch (error) {
      this.logger.error(
        `Failed to batch-enrich user list identity from shared-user: ${error?.message}`,
        error?.stack,
        `${UserService.name}.${this.getAllUsers.name}`,
      );
      throw new ServiceUnavailableException();
    }

    return {
      hasNext: hasNext,
      hasPrevios: hasPrevious,
      items,
      total,
      page,
      pageSize,
      totalPages,
    } as AppPaginatedResponseDto<UserResponseDto>;
  }

  /**
   * QD16 - khoa/mo khoa tai khoan. Cung ly do dat cua kiem quyen o day nhu
   * `resetPassword`.
   *
   * > ### Day KHONG phai dao nguoc quyet dinh xoa route `toggle-active` cu
   * > Ban cu cua route nay thao tac tren **cot `isActive` cuc bo cua
   * > `terminal`** - hai ban trang thai khong dong bo. Ban nay **khong ghi cot
   * > nao cua `terminal`**: no doc trang thai hien tai TU `shared-user`, dao,
   * > roi gui gia tri DICH sang `shared-user`. Trang thai khoa van chi co
   * > **mot nguon that** la `shared_user_db`.
   *
   * Doc-roi-ghi chu khong goi mot lenh "toggle" o ben kia la co y: route noi
   * bo nhan gia tri dich nen goi lai hai lan ra cung ket qua.
   */
  async toggleActiveUser(slug: string) {
    const context = `${UserService.name}.${this.toggleActiveUser.name}`;
    const user = await this.userRepository.findOne({
      where: { slug },
    });
    if (!user) {
      this.logger.warn(`User ${slug} not found`, context);
      throw new UserException(UserValidation.USER_NOT_FOUND);
    }

    const sharedUser = await this.sharedUserServiceClient.lookupById(
      user.sharedUserId,
    );
    if (!sharedUser) throw new UserException(UserValidation.USER_NOT_FOUND);

    let updated: SharedUserLookupResponse;
    try {
      updated = await this.sharedUserServiceClient.toggleActive(
        user.sharedUserId,
        !sharedUser.isActive,
      );
    } catch (error) {
      this.toSharedUserCommandError(error, context);
    }
    this.logger.log(
      `User ${slug} active status set to ${updated.isActive}`,
      context,
    );

    const dto = this.mapper.map(user, User, UserResponseDto);
    return this.mergeSharedUserIdentity(dto, updated);
  }

  async updateUserLanguage(
    userId: string,
    requestData: UpdateUserLanguageRequestDto,
  ) {
    const context = `${UserService.name}.${this.updateUserLanguage.name}`;
    // CO Y khong load quan he `branch`/`role` o day. Ban goc cua route nay
    // cung khong load, nen 2 field do KHONG xuat hien trong JSON tra ve; them
    // relations vao se lam response moc them 2 key - doi shape ngoai chu dich,
    // dung dieu architect-http.md muc 1.4 cam.
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      this.logger.warn(`User ${userId} not found`, context);
      throw new UserException(UserValidation.USER_NOT_FOUND);
    }

    // `language` la mot field IDENTITY (architect-http.md muc 1.6) - truoc day
    // route nay chi ghi cot cuc bo, nen ban `language` ben shared-user khong
    // bao gio duoc cap nhat va 2 ben lech im lang. Nay ghi xuyen 2 service
    // theo dung muc 1.2: shared-user truoc, cuc bo sau, rollback neu buoc sau
    // hong.
    //
    // Van GIU ban cuc bo (dual-write) vi notification/campaign cua terminal
    // con doc `user.language` truc tiep - go cac cho do thuoc giai doan sau
    // (quyet dinh A').
    const beforeIdentity = await this.sharedUserServiceClient.lookupById(
      user.sharedUserId,
    );
    if (!beforeIdentity) {
      this.logger.error(
        `No shared-user identity for sharedUserId ${user.sharedUserId}`,
        null,
        context,
      );
      throw new UserException(UserValidation.USER_NOT_FOUND);
    }

    const identity = await this.sharedUserServiceClient.updateIdentity(
      user.sharedUserId,
      { language: requestData.language },
    );

    user.language = requestData.language;
    try {
      await this.userRepository.save(user);
    } catch (error) {
      this.logger.error(
        `Error when saving local language: ${error.message}`,
        error.stack,
        context,
      );
      await this.rollbackSharedUserIdentity(
        user.sharedUserId,
        { language: beforeIdentity.language },
        { language: requestData.language },
        context,
      );
      // Cung ma loi ma updateUser dung khi luu cuc bo that bai - khong dat
      // them ma moi cho mot nhanh loi cung loai.
      throw new AuthException(AuthValidation.ERROR_UPDATE_USER);
    }

    this.logger.log(`User ${user.slug} language has been updated`, context);

    // Ghep identity moi nhat tu shared-user vao response - cung pattern
    // AuthService.getProfile (architect-http.md muc 1.1 quy tac 4). Danh sach
    // field ghep khop dung AuthProfileResponseDto, khong them khong bot (muc
    // 1.4).
    const dto = this.mapper.map(user, User, AuthProfileResponseDto);
    Object.assign(dto, {
      phonenumber: identity.phonenumber ?? dto.phonenumber,
      firstName: identity.firstName ?? dto.firstName,
      lastName: identity.lastName ?? dto.lastName,
      dob: identity.dob ?? dto.dob,
      email: identity.email ?? dto.email,
      address: identity.address ?? dto.address,
      image: identity.image ?? dto.image,
      isVerifiedEmail: identity.isVerifiedEmail ?? dto.isVerifiedEmail,
      isVerifiedPhonenumber:
        identity.isVerifiedPhonenumber ?? dto.isVerifiedPhonenumber,
      language: identity.language ?? dto.language,
    });
    return dto;
  }
}
