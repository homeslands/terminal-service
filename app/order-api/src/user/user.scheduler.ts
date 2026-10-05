import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Repository } from 'typeorm';
import { Cron, CronExpression, Timeout } from '@nestjs/schedule';
import { Role } from 'src/role/role.entity';
import { RoleEnum } from 'src/role/role.enum';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Redlock from 'redlock';
import { DistributeLockJobKey, QueueRegisterKey } from 'src/app/app.constants';
import { SharedUserServiceClient } from 'src/external-services/shared-user-service/shared-user-service.client';
import { UserProvisioningService } from './user-provisioning.service';
import { DEFAULT_CUSTOMER_PHONENUMBER } from 'src/accumulated-point/accumulated-point.utils';
import {
  SYNC_USERS_FAST_GRID_WINDOW_MINUTES,
  SYNC_USERS_WIDE_GRID_WINDOW_HOURS,
} from './user.constant';

@Injectable()
export class UserScheduler {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    @InjectQueue(QueueRegisterKey.DISTRIBUTE_LOCK_JOB)
    private readonly distributeLockJobQueue: Queue,
    private readonly sharedUserServiceClient: SharedUserServiceClient,
    // QD19 - lop 3 dung CHUNG `ensureLocalUser` voi ba lop con lai.
    private readonly userProvisioningService: UserProvisioningService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async updateUserRole() {
    const context = `${UserScheduler.name}.${this.updateUserRole.name}`;
    this.logger.log(`Update user role`, context);

    const usersWithoutRole = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('role.id IS NULL')
      .getMany();

    this.logger.log(
      `Number of users without role: ${usersWithoutRole.length}`,
      context,
    );

    const role = await this.roleRepository.findOne({
      where: {
        name: RoleEnum.Customer,
      },
    });

    if (!role) {
      this.logger.warn(`Role ${RoleEnum.Customer} not found`);
      return;
    }

    const updatedUsers = usersWithoutRole.map((item) => {
      item.role = role;
      return item;
    });

    this.userRepository.manager.transaction(async (manager) => {
      await manager.save(updatedUsers);
    });
    this.logger.log(`Update user role successfully`, context);
  }

  // KHONG con `initSuperAdmin` (chot 05/10/2026). Ban cu tu tao hang
  // `root`/`root` cuc bo luc khoi dong - hai ly do bo:
  // - Hang tao ra khong co `sharedUserId` (cot NOT NULL) nen insert luon hong
  //   tren DB trang.
  // - Dang nhap nay o shared-user; super admin cua terminal la danh tinh
  //   `root-terminal` (owner_service = 'terminal'), do luot backfill
  //   `scripts/backfill-shared-user-ids.ts` tao bang cach DOI SDT hang `root`
  //   cu - khong phai do ham khoi dong tao. `root` ben shared-user la cua trend.

  // Sentinel khach vang lai `default-customer` DUNG CHUNG voi trend: hang cuc
  // bo phai tro vao dung danh tinh sentinel ben shared-user, khong tu sinh
  // danh tinh rieng.
  //
  // Co tinh KHONG di qua `ensureLocalUser`: ham do tu choi danh tinh co
  // `ownerService` cua service khac (QD18), ma sentinel la ngoai le - no khong
  // phai mot con nguoi, va dung chung toan cum bat ke cot do ghi gi.
  //
  // shared-user khong tra loi luc khoi dong => chi canh bao; lan khoi dong
  // sau thu lai. Khong tu tao hang thieu `sharedUserId`.
  @Timeout(5000)
  async initDefaultCustomer() {
    const context = `${UserScheduler.name}.${this.initDefaultCustomer.name}`;
    this.logger.log(`Initializing default customer...`, context);

    const hasDefaultCustomer = await this.userRepository.exists({
      where: {
        phonenumber: DEFAULT_CUSTOMER_PHONENUMBER,
      },
    });
    if (hasDefaultCustomer) {
      this.logger.warn(`Default customer already existed...`, context);
      return;
    }

    const role = await this.roleRepository.findOne({
      where: {
        name: RoleEnum.Customer,
      },
    });
    if (!role) {
      this.logger.warn(`Role ${RoleEnum.Customer} not found`, context);
      return;
    }

    try {
      const sharedSentinel =
        await this.sharedUserServiceClient.lookupByPhonenumber(
          DEFAULT_CUSTOMER_PHONENUMBER,
        );
      if (!sharedSentinel) {
        this.logger.warn(
          `shared-user has no '${DEFAULT_CUSTOMER_PHONENUMBER}' sentinel - local default customer NOT created`,
          context,
        );
        return;
      }

      const defaultCustomer = this.userRepository.create({
        role,
        sharedUserId: sharedSentinel.id,
        phonenumber: DEFAULT_CUSTOMER_PHONENUMBER,
        firstName: 'Default',
        lastName: 'Customer',
        createdAt: new Date(sharedSentinel.createdAt),
      });
      await this.userRepository.save(defaultCustomer);
      this.logger.log(
        `Default customer linked to shared sentinel ${sharedSentinel.id}`,
        context,
      );
    } catch (error) {
      this.logger.error(
        `Error when creating default customer: ${error.message}`,
        error.stack,
        context,
      );
    }
  }

  // ==========================================================================
  // QD19 LOP 3 + QD21 - hai luoi dinh ky keo user moi tu shared-user ve.
  //
  // Vi sao PHAI la HAI luoi chu khong phai mot:
  //
  // Luoi nhanh (10 phut, cua so 30 phut) bat het truong hop binh thuong.
  // Nhung no la cua so CO DINH: `terminal` chet 4 tieng roi song lai thi
  // nhung ai dang ky trong 4 tieng do **da bi bo lo**, va khong ai backfill
  // lai. Cua so cua luoi rong phai rong hon khoang chet te nhat minh chap
  // nhan duoc - 48 gio thi song sot qua mot ngay sap tron ven.
  //
  // Noi cho dung: chet >2 ngay, hoac chinh job 2h sang cung hong, thi **van
  // sot** - no cung la cua so co dinh, chi to hon 96 lan. Day khong phai loi
  // giai tuyet doi (cua so theo `lastRun` moi la), nhung lay ~90% gia tri voi
  // ~10% cong suc.
  //
  // ⚠️ Hai luoi nay chi bu NGUOI MOI TAO GAN DAY. Chung KHONG BAO GIO cham
  // toi hang chuc nghin khach lich su, va cung khong sua duoc ~126 hang cuc
  // bo dang mang `sharedUserId` placeholder (xem ghi chu tai
  // `User.sharedUserId`). Viec do thuoc luot backfill A7-f -
  // `scripts/backfill-shared-user-ids.ts`.
  // ==========================================================================

  // LUOI NHANH. Chong lan 3 lan (chu ky 10 phut, cua so 30 phut) la CO Y - de
  // khong roi nguoi o dung bien cua so: do tre dong ho, giao dich commit
  // cham.
  @Cron(CronExpression.EVERY_10_MINUTES)
  async syncRecentlyRegisteredUsersFast() {
    const context = `${UserScheduler.name}.${this.syncRecentlyRegisteredUsersFast.name}`;

    const lock = await this.acquireSyncLock(
      DistributeLockJobKey.SYNC_RECENTLY_REGISTERED_USERS_FAST,
      1000 * 60 * 5, // 5 phut - du rong cho mot cua so 30 phut
      context,
    );
    if (!lock) return;

    try {
      const to = new Date();
      const from = new Date(
        to.getTime() - SYNC_USERS_FAST_GRID_WINDOW_MINUTES * 60 * 1000,
      );
      const { created, skippedForeign, total } = await this.syncUserWindow(
        from,
        to,
      );

      // IM LANG khi khong co gi. Log muc `log` moi luot (ke ca "Found 0 ...,
      // skip"), moi 10 phut, mai mai - do la tieng on che mat moi thu khac.
      if (created || skippedForeign) {
        this.logger.log(
          `Fast grid synced ${created}/${total} user(s), skipped ${skippedForeign} owned by another service`,
          context,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error when running fast grid user sync`,
        error.stack,
        context,
      );
    } finally {
      await lock.release();
    }
  }

  // LUOI RONG. Chu ky 2h sang, cua so 48 gio.
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async syncRecentlyRegisteredUsers() {
    const context = `${UserScheduler.name}.${this.syncRecentlyRegisteredUsers.name}`;

    const lock = await this.acquireSyncLock(
      DistributeLockJobKey.SYNC_RECENTLY_REGISTERED_USERS,
      // TTL rieng, KHONG be nguyen 5 phut cua luoi nhanh: cua so 48 gio co the
      // la vai nghin hang, chay lau hon 5 phut thi khoa het han giua chung va
      // mot replica khac chen vao.
      1000 * 60 * 30,
      context,
    );
    if (!lock) return;

    try {
      const to = new Date();
      const from = new Date(
        to.getTime() - SYNC_USERS_WIDE_GRID_WINDOW_HOURS * 60 * 60 * 1000,
      );

      this.logger.log(
        `Wide grid sync users registered from ${from.toISOString()} to ${to.toISOString()}`,
        context,
      );

      const { created, skippedForeign, total } = await this.syncUserWindow(
        from,
        to,
      );

      if (created > 0) {
        // ==================================================================
        // DAY MOI LA PHAN GIA TRI NHAT CUA JOB NAY, chu khong phai viec bu.
        //
        // Luoi rong thuong xuyen bu duoc nguoi nghia la **luoi nhanh dang
        // hong ma khong ai biet**. Mot cai luoi an toan AM THAM va loi la cai
        // luoi che mat van de that. Nen o day phai KEU LEN kem so luong - job
        // ngay vua la luoi bu, vua la cam bien suc khoe cua luoi nhanh, ma
        // khong ton them gi.
        // ==================================================================
        this.logger.warn(
          `Wide grid had to provision ${created}/${total} user(s) - the 10-minute fast grid should have caught them. Check whether it is running.`,
          context,
        );
      } else {
        this.logger.log(
          `Wide grid found nothing to provision out of ${total} user(s) - fast grid is healthy`,
          context,
        );
      }
      if (skippedForeign) {
        this.logger.log(
          `Wide grid skipped ${skippedForeign} user(s) owned by another service`,
          context,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error when syncing recently registered users`,
        error.stack,
        context,
      );
    } finally {
      await lock.release();
    }
  }

  // Than chung cua hai luoi. Dung `ensureLocalUsers` - KHONG viet vong insert
  // thu hai (xem UserProvisioningService: hang phong thu la unique constraint,
  // khong phai `exists()`), va loc `ownerService` theo QD18.
  private async syncUserWindow(
    from: Date,
    to: Date,
  ): Promise<{ created: number; skippedForeign: number; total: number }> {
    // Client tu phan trang - cua so 48 gio co the la vai nghin hang (QD21).
    const recentSharedUsers = await this.sharedUserServiceClient.listRecent(
      from,
      to,
    );
    if (!recentSharedUsers.length) {
      return { created: 0, skippedForeign: 0, total: 0 };
    }
    const { created, skippedForeign } =
      await this.userProvisioningService.ensureLocalUsers(recentSharedUsers);
    return { created, skippedForeign, total: recentSharedUsers.length };
  }

  // Hai luoi dung HAI KHOA RIENG (xem DistributeLockJobKey). Khong lay duoc
  // khoa thi bo qua - replica khac dang chay.
  private async acquireSyncLock(
    key: string,
    ttl: number,
    context: string,
  ): Promise<{ release: () => Promise<unknown> } | null> {
    const client = await this.distributeLockJobQueue.client;
    const redlock = new Redlock([client]);
    try {
      return await redlock.acquire([key], ttl);
    } catch {
      this.logger.log(
        `Another replica is already running ${key}, skip`,
        context,
      );
      return null;
    }
  }
}
