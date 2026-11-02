import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Inject } from '@nestjs/common';
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
import { UserGroup } from 'src/user-group/user-group.entity';
import { UserGroupValidation } from 'src/user-group/user-group.validation';
import { UserGroupException } from 'src/user-group/user-group.exception';
import { UserGroupMember } from 'src/user-group-member/user-group-member.entity';
import { SharedUserServiceClient } from 'src/external-services/shared-user-service/shared-user-service.client';
import { toMembershipCardResponse } from 'src/external-services/shared-user-service/shared-user-shape.mapper';
import { UserProvisioningService } from 'src/user/user-provisioning.service';

/**
 * QD22 (buoc 2.5) - the thanh vien DA CHUYEN NGUON sang shared-user.
 *
 * Service nay khong con doc/ghi `membership_card_tbl` cuc bo: moi phep phat,
 * khoa/mo, thay, go deu di qua `/internal/membership-cards/*`. Bang cuc bo
 * ngung duoc ghi tu day (doi ten o buoc 8.9, drop o 10.3).
 *
 * Quyen van kiem o trend (`@HasRoles` tren controller - khuon QD16): path,
 * body va shape response giu nguyen y cu (muc 1.4), chi than ham doi.
 *
 * Ma loi: tra THANG ma nghiep vu cua shared-user (159801/159803/159807/
 * 159808...) thay vi dich het ve mot ma - bon tinh huong khac nhau phai ra
 * bon cau khac nhau o giao dien (chot 26/10/2026). Day va trend dung CUNG
 * day ma 1598xx cho cung y nghia nen khong can bang anh xa.
 */
@Injectable()
export class MembershipCardService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserGroup)
    private readonly userGroupRepository: Repository<UserGroup>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    private readonly transactionManagerService: TransactionManagerService,
    private readonly sharedUserServiceClient: SharedUserServiceClient,
    private readonly userProvisioningService: UserProvisioningService,
  ) {}

  /**
   * Loi tu mot lenh GHI the cua shared-user. Cac ham ghi cua client KHONG di
   * qua `toReadError` (de ben goi doc duoc status), nen phep dich nam o day.
   *
   * 4xx co ma nghiep vu => tra lai nguyen ma + nguyen cau cua shared-user.
   * Con lai (mat mang, 5xx) => `fallback` cua chinh thao tac do, de giao dien
   * khong hien "khong tim thay the" cho mot su co mang.
   */
  private throwCardWriteError(
    error: unknown,
    fallback: typeof MembershipCardValidation.ERROR_WHEN_CREATE_MEMBERSHIP_CARDS,
    context: string,
  ): never {
    const response = (
      error as {
        response?: {
          status?: number;
          data?: { statusCode?: number; message?: string };
        };
        message?: string;
      }
    )?.response;
    const status = response?.status;
    const code = response?.data?.statusCode;

    this.logger.error(
      `Membership card write failed on shared-user: status=${status ?? '-'} code=${code ?? '-'} ${response?.data?.message ?? (error as Error)?.message ?? ''}`,
      (error as Error)?.stack,
      context,
    );

    if (status && status >= 400 && status < 500 && typeof code === 'number') {
      throw new MembershipCardException(
        { code, message: response.data.message ?? fallback.message },
        response.data.message,
        status,
      );
    }
    throw new MembershipCardException(fallback);
  }

  /** `slug` cuc bo cua nguoi -> `sharedUserId` (khoa that cua the). */
  private async resolveSharedUserId(userSlug: string): Promise<string> {
    const user = await this.userRepository.findOne({
      where: { slug: userSlug },
      select: { id: true, sharedUserId: true },
    });
    if (!user?.sharedUserId) {
      throw new UserException(UserValidation.USER_NOT_FOUND);
    }
    return user.sharedUserId;
  }

  async createMembershipCard(
    requestData: CreateMembershipCardDto,
  ): Promise<MembershipCardResponseDto> {
    const context = `${MembershipCardService.name}.${this.createMembershipCard.name}`;
    const userId = await this.resolveSharedUserId(requestData.user);

    try {
      const card = await this.sharedUserServiceClient.assignMembershipCard({
        userId,
        code: requestData.code,
        expiredAt: requestData.expiredAt,
      });
      this.logger.log(`Membership card assigned: ${card.slug}`, context);
      return toMembershipCardResponse(card);
    } catch (error) {
      // 159803 (nguoi da co the) / 159807 (ma da duoc dung) di nguyen ve UI.
      this.throwCardWriteError(
        error,
        MembershipCardValidation.ERROR_WHEN_CREATE_MEMBERSHIP_CARDS,
        context,
      );
    }
  }

  /**
   * Phat mot LO the (QD22.b).
   *
   * Thu tu co y nghia:
   * 1. kiem `userGroup` TRUOC khi goi shared-user - nhom sai thi khong tao gi
   *    ben do (truoc day tao xong moi phat hien);
   * 2. `bulk-issue` - MOT transaction ben shared-user: danh tinh + 2
   *    requirement + the, hong o dau thi ca lo khong co gi;
   * 3. cap hang cuc bo tu chinh `user` tra ve (khong goi lookup lan nua) roi
   *    gan vao nhom.
   *
   * Buoc 3 hong thi KHONG thu hoi the o shared-user (the da phat la that,
   * da in ra, da quet duoc): tra loi kem danh sach ma da phat de quan tri
   * them nhom bang `POST /user-group-member/bulk` - lop 3 cua QD19 tu bu hang
   * cuc bo.
   */
  async bulkCreateMembershipCard(
    createdById: string,
    requestData: BulkCreateMembershipCardDto,
  ): Promise<MembershipCardResponseDto[]> {
    const context = `${MembershipCardService.name}.${this.bulkCreateMembershipCard.name}`;
    const codes = Array.from(new Set(requestData.codes));

    let userGroup: UserGroup | null = null;
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

    let issued: Awaited<
      ReturnType<SharedUserServiceClient['bulkIssueMembershipCards']>
    >;
    try {
      issued = await this.sharedUserServiceClient.bulkIssueMembershipCards(
        codes,
        requestData.expiredAt,
      );
    } catch (error) {
      this.throwCardWriteError(
        error,
        MembershipCardValidation.ERROR_WHEN_CREATE_MEMBERSHIP_CARDS,
        context,
      );
    }

    const issuedCodes = issued.map((item) => item.code);
    const sharedUserIds = issued.map((item) => item.userId);

    // Hang cuc bo cho chu the: KHONG mang identity, khong `bcrypt`, khong
    // `isActive` - chi {sharedUserId, phonenumber (cot NOT NULL toi GD8),
    // role Customer, createdAt that}. Dung `user` du shape lookup ma
    // `bulk-issue` vua tra ve (QD22.b), khong goi them luot nao.
    await this.userProvisioningService.ensureLocalUsers(
      issued.map((item) => item.user),
    );

    const localUsers = await this.userRepository.find({
      where: { sharedUserId: In(sharedUserIds) },
    });
    if (localUsers.length !== sharedUserIds.length) {
      this.logger.error(
        `Issued ${issuedCodes.length} membership cards on shared-user but only provisioned ${localUsers.length}/${sharedUserIds.length} local rows. Cards are NOT revoked. Issued codes: ${issuedCodes.join(', ')}`,
        null,
        context,
      );
      throw new MembershipCardException(
        MembershipCardValidation.ERROR_WHEN_CREATE_MEMBERSHIP_CARDS,
        `The cards were issued (${issuedCodes.join(', ')}) but some customer rows could not be created on trend. The cards are usable; add the customers to the group with POST /user-group-member/bulk.`,
      );
    }

    if (userGroup) {
      await this.transactionManagerService.execute<void>(
        async (manager) => {
          const members = localUsers.map((user) => {
            const member = new UserGroupMember();
            member.user = user;
            member.userGroup = userGroup;
            member.createdBy = createdById;
            return member;
          });
          await manager.save(members);
        },
        () => {
          this.logger.log(
            `Membership cards issued: ${issuedCodes.length}, added to group ${userGroup.slug}`,
            context,
          );
        },
        (error) => {
          this.logger.error(
            `Cards issued (${issuedCodes.join(', ')}) but adding them to group ${userGroup.slug} failed: ${error.message}`,
            error.stack,
            context,
          );
          throw new MembershipCardException(
            MembershipCardValidation.ERROR_WHEN_CREATE_MEMBERSHIP_CARDS,
            `The cards were issued (${issuedCodes.join(', ')}) but could not be added to the customer group. The cards are usable; add the customers to the group with POST /user-group-member/bulk.`,
          );
        },
      );
    } else {
      this.logger.log(
        `Membership cards issued: ${issuedCodes.length}`,
        context,
      );
    }

    // `bulk-issue` tra `{cardId, code, userId, user}` - KHONG co `slug`,
    // `isActive`, `createdAt`, tuc khong du de dung hop dong
    // `MembershipCardResponseDto`. Doc lai bang MOT luot batch `lookup` thay
    // vi tu bia ba field do.
    //
    // Luot nay hong thi the VAN DA PHAT: tra loi kem danh sach ma, khong thu
    // hoi - giong nhanh cap hang cuc bo o tren.
    try {
      const cards =
        await this.sharedUserServiceClient.lookupMembershipCardsByUserIds(
          sharedUserIds,
        );
      const cardByUserId = new Map(cards.map((card) => [card.userId, card]));
      return issued.map((item) =>
        toMembershipCardResponse(cardByUserId.get(item.userId)),
      );
    } catch (error) {
      this.logger.error(
        `Cards issued (${issuedCodes.join(', ')}) but reading them back failed: ${error?.message}`,
        error?.stack,
        context,
      );
      throw new MembershipCardException(
        MembershipCardValidation.ERROR_WHEN_CREATE_MEMBERSHIP_CARDS,
        `The cards were issued (${issuedCodes.join(', ')}) and are usable, but reading them back from shared-user failed. Reload the customer list to see them.`,
      );
    }
  }

  /**
   * Khoa/mo the cua mot nguoi.
   *
   * Route cua trend khong co body (`PATCH user/:slug/toggle-active`) nen phai
   * doc trang thai hien tai roi gui trang thai DICH - `/internal/.../
   * toggle-active` co tinh khong tu dao de goi hai lan khong ra hai ket qua.
   *
   * Phep "mo mot the da het han => tu choi" (159808) nay do shared-user lam,
   * khong lam lai o day.
   */
  async toggleActiveMembershipCard(
    userSlug: string,
  ): Promise<MembershipCardResponseDto> {
    const context = `${MembershipCardService.name}.${this.toggleActiveMembershipCard.name}`;
    const userId = await this.resolveSharedUserId(userSlug);

    const card =
      await this.sharedUserServiceClient.lookupMembershipCardByUserId(userId);
    if (!card) {
      this.logger.error(
        `User does not have a membership card: ${userSlug}`,
        null,
        context,
      );
      throw new MembershipCardException(
        MembershipCardValidation.MEMBERSHIP_CARD_NOT_FOUND,
      );
    }

    try {
      const saved = await this.sharedUserServiceClient.setMembershipCardActive(
        card.id,
        !card.isActive,
      );
      this.logger.log(
        `Membership card active status has been toggled: ${saved.slug}`,
        context,
      );
      return toMembershipCardResponse(saved);
    } catch (error) {
      this.throwCardWriteError(
        error,
        MembershipCardValidation.MEMBERSHIP_CARD_NOT_FOUND,
        context,
      );
    }
  }

  async replaceMembershipCard(
    requestData: ReplaceMembershipCardDto,
  ): Promise<MembershipCardResponseDto> {
    const context = `${MembershipCardService.name}.${this.replaceMembershipCard.name}`;
    const userId = await this.resolveSharedUserId(requestData.user);

    try {
      const card = await this.sharedUserServiceClient.replaceMembershipCard({
        userId,
        code: requestData.code,
        expiredAt: requestData.expiredAt,
      });
      this.logger.log(`Membership card replaced: ${card.slug}`, context);
      return toMembershipCardResponse(card);
    } catch (error) {
      // Quet lai CHINH the dang cam de gia han van duoc (shared-user cho) -
      // giu dung hanh vi cu cua trend. Ma nguoi khac dang giu => 159807.
      this.throwCardWriteError(
        error,
        MembershipCardValidation.ERROR_WHEN_REPLACE_MEMBERSHIP_CARD,
        context,
      );
    }
  }

  async deleteMembershipCard(userSlug: string): Promise<void> {
    const context = `${MembershipCardService.name}.${this.deleteMembershipCard.name}`;
    const userId = await this.resolveSharedUserId(userSlug);

    const card =
      await this.sharedUserServiceClient.lookupMembershipCardByUserId(userId);
    if (!card) {
      this.logger.error(
        `User does not have a membership card: ${userSlug}`,
        null,
        context,
      );
      throw new MembershipCardException(
        MembershipCardValidation.MEMBERSHIP_CARD_NOT_FOUND,
      );
    }

    try {
      await this.sharedUserServiceClient.removeMembershipCard(card.id);
      this.logger.log(`Membership card deleted: ${card.slug}`, context);
    } catch (error) {
      this.throwCardWriteError(
        error,
        MembershipCardValidation.ERROR_WHEN_DELETE_MEMBERSHIP_CARD,
        context,
      );
    }
  }
}
