import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { User } from './user.entity';
import { Role } from 'src/role/role.entity';
import { RoleEnum } from 'src/role/role.enum';
import { UserException } from './user.exception';
import { UserValidation } from './user.validation';
import { SharedUserLookupResponse } from 'src/external-services/shared-user-service/shared-user-service.client';
import { INTERNAL_SERVICE_NAME } from 'src/common/constants/internal-api.constant';

/**
 * QD19 - CHO DUY NHAT terminal tao hang `user` cuc bo tu mot danh tinh cua
 * `shared-user`.
 *
 * Hang `user` cuc bo **khong phai "ban sao khach"** - no la *ho so cua khach
 * tai service nay*. Bon lop deu goi vao day, va deu chay DONG THOI duoc:
 *
 *   Lop 0  chinh nguoi do dang nhap            JwtStrategy
 *   Lop 1  moi luot goi GET /user (sync-on-read) UserService.getAllUsers
 *   Lop 1b GET /user rong + go du SDT: tra dung  UserService.getAllUsers
 *          nguoi do (lookup-on-miss)
 *   Lop 3  hai job dinh ky (10 phut / 1 ngay)   UserScheduler
 *
 * (Lop 2 - goi o moi diem GHI tham chieu toi khach - KHONG cai: moi duong
 * ghi chi nhan `slug` cuc bo, ma slug do chi co duoc sau khi nhan vien tim
 * ra khach qua GET /user, tuc da di qua lop 1 + 1b. Xem
 * progress/terminal-api.md A7-c.)
 *
 * ### Vi sao phai la MOT ham, khong duoc nhan ban vong insert
 *
 * Cron 10 phut se no dung luc ba may o quay dang go tim khach, trong khi
 * chinh khach do vua mo app dang nhap. Hang phong thu la **UNIQUE CONSTRAINT
 * o tang DB**, khong phai `exists()` roi insert - hai request cung thay
 * "chua co" roi cung ghi la TOCTOU. Ham nay nuot loi trung roi **doc lai
 * hang ben kia vua tao**. Viet nhanh insert thu hai o bat ky dau la mo lai
 * dung cai lo do.
 */
@Injectable()
export class UserProvisioningService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
  ) {}

  /**
   * QD18 - terminal chi duoc tu cap hang cuc bo cho danh tinh DUNG CHUNG
   * (`ownerService` null) hoac danh tinh cua chinh no (`'terminal'`).
   *
   * Khac di la nhan vien cua service khac: theo quy tac nghiep vu ho
   * **khong duoc dung nhu khach o day**. Ho muon mua hang o terminal thi dung
   * mot SDT khac - cot `owner_service` la cot bat bien, khong co duong go.
   *
   * > Hom nay chua co service tieu thu thu hai nen nhanh nay chua bat duoc
   * > ai. Van viet ngay: viet luc dang mo dung tep nay thi re, con nho ra
   * > sau khi service kia da chay thi da co nguoi lot.
   */
  isProvisionable(ownerService?: string | null): boolean {
    return !ownerService || ownerService === INTERNAL_SERVICE_NAME;
  }

  /**
   * Tra ve hang cuc bo cua `sharedUser`, tao moi neu chua co.
   *
   * - `relations`: quan he can nap kem khi doc lai (JwtStrategy can ca cay
   *   role.permissions de dung scope; cac cho khac thuong khong can gi).
   * - Nem `USER_OWNED_BY_ANOTHER_SERVICE` neu danh tinh thuoc service khac.
   *   Cac vong quet (lop 1, lop 3) nen goi `isProvisionable` truoc de BO
   *   QUA im lang thay vi de ham nay nem giua vong lap.
   */
  async ensureLocalUser(
    sharedUser: SharedUserLookupResponse,
    relations?: string[],
  ): Promise<User> {
    const { user } = await this.provisionLocalUser(sharedUser, relations);
    return user;
  }

  // Ban day du, co bao lai **co that su tao moi hay khong**. Con so do la
  // thu luoi rong (QD21) dung lam canh bao - xem ensureLocalUsers.
  private async provisionLocalUser(
    sharedUser: SharedUserLookupResponse,
    relations?: string[],
  ): Promise<{ user: User; created: boolean }> {
    const context = `${UserProvisioningService.name}.${this.provisionLocalUser.name}`;

    const existed = await this.userRepository.findOne({
      where: { sharedUserId: sharedUser.id },
      relations,
    });
    if (existed) return { user: existed, created: false };

    if (!this.isProvisionable(sharedUser.ownerService)) {
      this.logger.warn(
        `Refuse to provision local user for sharedUserId=${sharedUser.id} owned by service '${sharedUser.ownerService}'`,
        context,
      );
      throw new UserException(UserValidation.USER_OWNED_BY_ANOTHER_SERVICE);
    }

    const customerRole = await this.roleRepository.findOne({
      where: { name: RoleEnum.Customer },
    });
    if (!customerRole) {
      this.logger.error(`Role ${RoleEnum.Customer} not found`, null, context);
      throw new UserException(UserValidation.ERROR_CREATE_USER);
    }

    let created = false;
    try {
      const newUser = this.userRepository.create({
        sharedUserId: sharedUser.id,
        // Cot NOT NULL + UNIQUE - van phai chep xuong (quyet dinh A': giu 11 cot
        // identity lam cache cuc bo, dual-write; xem progress/terminal-api.md).
        phonenumber: sharedUser.phonenumber,
        role: customerRole,
        // Ngay dang ky THAT ben shared-user - KHONG de @CreateDateColumn tu
        // sinh theo gio tao hang nay (gio dang nhap lan dau / gio job chay,
        // khong phai gio dang ky). Xem issuses/sync-user-data-with-role.md
        // muc 6.3.
        createdAt: new Date(sharedUser.createdAt),
      });
      await this.userRepository.save(newUser);
      created = true;
    } catch (error) {
      // Race giua bon lop: ca hai cung thay "chua co" roi cung insert, mot
      // trong hai vi pham unique constraint (sharedUserId/phonenumber).
      // KHONG coi la loi - doc lai hang ben kia vua tao thanh cong.
      this.logger.warn(
        `Insert local user raced or failed for sharedUserId=${sharedUser.id}, re-reading: ${error.message}`,
        context,
      );
    }

    const user = await this.userRepository.findOne({
      where: { sharedUserId: sharedUser.id },
      relations,
    });
    // Den day ma van khong co hang nghia la lenh insert that bai vi ly do
    // KHAC race (vd role bi xoa, DB tu choi) - khong duoc nuot tiep.
    if (!user) {
      this.logger.error(
        `Local user still missing after insert attempt for sharedUserId=${sharedUser.id}`,
        null,
        context,
      );
      throw new UserException(UserValidation.ERROR_CREATE_USER);
    }
    return { user, created };
  }

  /**
   * Ban theo lo cho hai vong quet (lop 1 sync-on-read va lop 3 cron). Tra ve
   * so hang **thuc su duoc tao moi** - con so nay la thu luoi rong dung lam
   * canh bao (QD21: luoi rong bu duoc nguoi nghia la luoi nhanh dang hong ma
   * khong ai biet).
   */
  async ensureLocalUsers(sharedUsers: SharedUserLookupResponse[]): Promise<{
    created: number;
    skippedForeign: number;
  }> {
    const context = `${UserProvisioningService.name}.${this.ensureLocalUsers.name}`;
    let created = 0;
    let skippedForeign = 0;

    for (const sharedUser of sharedUsers) {
      // QD18 - bo qua nhan vien cua service khac, khong keo ho ve.
      if (!this.isProvisionable(sharedUser.ownerService)) {
        skippedForeign++;
        continue;
      }
      try {
        const result = await this.provisionLocalUser(sharedUser);
        if (result.created) created++;
      } catch (error) {
        // Mot hang hong khong duoc lam chet ca luot quet - ghi lai roi di
        // tiep, lan quet sau se gap lai chinh nguoi nay.
        this.logger.warn(
          `Skip provisioning sharedUserId=${sharedUser.id}: ${error.message}`,
          context,
        );
      }
    }

    return { created, skippedForeign };
  }
}
