import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuthProfileResponseDto } from './auth.dto';
import { User } from 'src/user/user.entity';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { UserUtils } from 'src/user/user.utils';
import { SharedUserServiceClient } from 'src/external-services/shared-user-service/shared-user-service.client';
import { toUserRequirementResponses } from 'src/external-services/shared-user-service/shared-user-shape.mapper';

/**
 * Buoc 3.2 (giai doan 3) - sau khi xoa SAU route xac minh email/SDT va sau
 * method cua chung, class nay chi con `getProfile`. Noi dung giong ban `trend`
 * tung dong; phan [thêm] cua terminal la helper chet `isTodayBirthday`.
 *
 * - Ban THAT cua sau route do nam o `shared-user` (`auth.controller.ts`
 *   L180-299, do 12/11/2026); `terminal-ui` goi thang sang do qua `httpAuth`
 *   (`api/auth.ts`), nen xoa ban o day khong lam vo luong xac minh nao.
 * - Bon helper chet xoa theo: `getZaloOaConnectorConfig`, `getFrontendUrl`,
 *   `getBackendUrl`, va `isTodayBirthday` ([thêm] so voi trend). Ba ten
 *   `getFrontendUrl` / `getBackendUrl` / `isTodayBirthday` TRUNG voi helper
 *   cua class khac (`NotificationUtils`, `PrinterEventUtils`, `UserService` -
 *   moi lop mot ban rieng), nen da kiem tung cho goi truoc khi xoa: khong ai
 *   goi ban cua `AuthService`.
 * - Constructor tu 19 tham so xuong 4. Bo di: `configService` + nam field
 *   `duration` / `refeshableDuration` / `zaloOaApiKey` / `zaloOaSecretKey` /
 *   `zaloOaId` (do 12/11/2026: chi duoc GHI trong constructor, 0 luot doc),
 *   `userRepository`, `branchRepository`, `roleRepository`,
 *   `registerOtpTokenRepository`, `verifyEmailRepository`,
 *   `verifyPhoneNumberRepository`, `fileService`, `mailService`,
 *   `systemConfigService`, `transactionManagerService`, `authUtils`,
 *   `zaloOaConnectorClient`, `zaloOaConnectorConfigRepository`,
 *   `sharedBalanceService`, `eventEmitter` - tat ca 0 luot dung sau khi xoa.
 *
 * ESLint `no-unused-vars` KHONG bat duoc tham so constructor (chung la thuoc
 * tinh cua class), nen danh sach tren do bang cach dem `this.<ten>` trong phan
 * than con lai. Dung dung cach do khi don tiep o 3.3 / 4.x.
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectMapper()
    private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    private readonly userUtils: UserUtils,
    private readonly sharedUserServiceClient: SharedUserServiceClient,
  ) {}

  /**
   * Handle retrieve user profile
   *
   * Ghep HAI NGUON (architect-http.md muc 1.1 quy tac 4):
   * - identity (ho ten, SDT, email, dob, address, avatar, co xac minh) tu
   *   `shared-user` - hoi lai tren moi lan goi, khong doc cache cuc bo co the
   *   cu (nguoi dung co the tu sua qua `PATCH {shared-user}/auth/profile`, bo
   *   qua `terminal` hoan toan);
   * - role + branch tu `terminal` - day moi la nguon that cua hai field do.
   *
   * Day la ly do UI giu `getProfile()` goi `terminal` chu khong goi
   * `shared-user`: mot hanh dong, mot lenh goi, UI khong ghep ho.
   *
   * ## ⚠️ VAN LOAD `role.permissions` - KHAC `trend`, va day la CO Y
   *
   * `trend` da bo field nay khoi response profile ("mot join DB thua, khong noi
   * nao doc"). O `terminal` cau do KHONG DUNG: co **ba** noi tieu thu doc
   * `userInfo.role.permissions.map(p => p.authority.code)`:
   *
   *   app/system/chef-area/page.tsx
   *   app/system/order-management/DataTable/columns/order-history-columns.tsx
   *   components/app/tabscontent/system-chef-area-management.tabscontent.tsx
   *
   * Ba cho do can ma cua TUNG AUTHORITY (`VIEW_KITCHEN_AREA`,
   * `DELETE_KITCHEN_AREA`, `EDIT_KITCHEN_AREA`, `DELETE_ORDER`), con
   * `GET /auth/scope` chi tra ma cua AUTHORITY GROUP (`AuthUtils.buildScope`
   * gom `permission.authority.authorityGroup.code`). **Hai do hat khac nhau,
   * khong thay the duoc nhau.**
   *
   * Bo field nay o giai doan 1 se lam ba be mat do nhan `undefined` va **im
   * lang** mat quyen (khong loi, khong log): nut xoa don bien mat, khu vuc bep
   * khong xem/sua/xoa duoc. Vi the viec bo no doi sang giai doan sau, cung dot
   * voi viec dua ma authority-level vao `/auth/scope` hoac doi ba cho tren sang
   * `GET /authority-group` + scope.
   *
   * Type `IUserInfo.role.permissions` ben UI da doi thanh **optional** de ba cho
   * do buoc phai null-safe ngay tu bay gio - ngay field nay that su bi bo thi
   * khong cho nao no.
   *
   * Fail-OPEN o day (khac `getUserBySlug` cua UserService, fail-closed): day
   * la enrichment hien thi cho CHINH nguoi dang dang nhap, khong phai kiem
   * tra bao mat. Va nguoi nay vua di qua `JwtStrategy` - thu da goi
   * shared-user va nem 503 neu no khong tra loi - nen den duoc day thi
   * shared-user dang song; nhanh catch chi bat duoc truong hop rieng lenh goi
   * nay hong, va khi do tra ban cache con tot hon lam hong ca man hinh.
   *
   * @param {string} userId
   * @returns {Promise<AuthProfileResponseDto>} User profile
   * @throws {AuthException} Throw if user not found
   */
  async getProfile({
    userId,
  }: {
    userId: string;
  }): Promise<AuthProfileResponseDto> {
    const context = `${AuthService.name}.${this.getProfile.name}`;
    const user = await this.userUtils.getUser({
      where: { id: userId },
      relations: {
        branch: {
          addressDetail: true,
        },
        role: {
          permissions: {
            authority: {
              authorityGroup: true,
            },
          },
        },
      },
    });
    const dto = this.mapper.map(user, User, AuthProfileResponseDto);
    // QD22 (buoc 2.5): requirement nay o shared-user. Field van co trong
    // response (muc 1.4), nhung gia tri lay tu `lookup` ngay duoi. Dat `[]`
    // truoc khi goi de nhanh fail-open khong tra ve `undefined`.
    dto.userRequirements = [];
    // Buoc 4.7: hai co xac minh khong con cot cuc bo - dat `false` truoc khi
    // goi de nhanh fail-open (va user khong co identity) van giu du key, kieu
    // boolean (muc 1.4). Co identity thi ghi de ben duoi.
    dto.isVerifiedEmail = false;
    dto.isVerifiedPhonenumber = false;
    try {
      const identity = await this.sharedUserServiceClient.lookupById(
        user.sharedUserId,
      );
      if (identity) {
        Object.assign(dto, {
          phonenumber: identity.phonenumber ?? dto.phonenumber,
          firstName: identity.firstName ?? dto.firstName,
          lastName: identity.lastName ?? dto.lastName,
          dob: identity.dob ?? dto.dob,
          email: identity.email ?? dto.email,
          address: identity.address ?? dto.address,
          image: identity.image ?? dto.image,
          // Ngon ngu cung la identity (architect-http.md muc 1.6): doi o
          // service nay thi service kia phai thay - doc cot cuc bo la tra
          // ban cu cua rieng service do.
          language: identity.language ?? dto.language,
          isVerifiedEmail: identity.isVerifiedEmail ?? dto.isVerifiedEmail,
          isVerifiedPhonenumber:
            identity.isVerifiedPhonenumber ?? dto.isVerifiedPhonenumber,
          userRequirements: toUserRequirementResponses(
            identity.userRequirements,
          ),
        });
      }
    } catch (error) {
      // Fail-open co san cua profile: giu nguyen chinh sach (day la enrichment
      // hien thi). Hau qua moi tu 2.5: `userRequirements` ve `[]` thay vi ban
      // cuc bo. Chap nhan duoc vi phep CHAN that nam o duong len don/thanh
      // toan va cho do fail-closed (`assertActive` nem 503).
      this.logger.warn(
        `Failed to enrich profile identity from shared-user, falling back to local cache: ${error?.message}`,
        context,
      );
    }
    return dto;
  }

  // ==========================================================================
  // CAC METHOD DA GO KHOI `terminal` (giai doan 1 - cutover auth/identity)
  //
  // forgotPassword, createForgotPasswordToken, resendForgotPasswordToken,
  // confirmForgotPassword, ChangeForgotPassword, uploadAvatar, changePassword,
  // updateProfile, validateUser, generateToken, login, initiateRegister,
  // resendRegisterOtp, completeRegister, register, refresh, deleteAccount.
  //
  // Tat ca thuoc ve `shared-user` (identity service).
  //
  // ⛔ `generateToken` la thu PHAI go, khong phai "go cho gon": no la duong
  // ky JWT duy nhat cua `terminal` (`jwtService.sign`). Giu no lai thi
  // `terminal` van ky duoc token - va token do bi `shared-user` tu choi, ra
  // dung loai loi "dang nhap duoc ma goi gi cung 401". Kiem lai bang
  // `grep -rn "jwtService.sign(" src/` => phai ra 0 ket qua.
  // ==========================================================================
}
