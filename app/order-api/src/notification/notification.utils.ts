import { Inject, Injectable, Logger } from '@nestjs/common';
import { RoleEnum } from 'src/role/role.enum';
import {
  NotificationMessageCode,
  NotificationType,
} from './notification.constants';
import { NotificationProducer } from './notification.producer';
import { User } from 'src/user/user.entity';
import { In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Order } from 'src/order/order.entity';
import { UserException } from 'src/user/user.exception';
import { UserValidation } from 'src/user/user.validation';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { NotificationException } from './notification.exception';
import { NotificationValidation } from './notification.validation';
import { isDefinedCustomer } from 'src/auth/auth.utils';
import { NotificationLanguageService } from './language/notification-language.service';
import { SystemConfigService } from 'src/system-config/system-config.service';
import { SystemConfigKey } from 'src/system-config/system-config.constant';
import { SystemConfigValidation } from 'src/system-config/system-config.validation';
import { CardOrder } from 'src/gift-card-modules/card-order/entities/card-order.entity';
import { TableBookingEntity } from 'src/table-booking/table-booking.entity';
import {
  SharedUserLookupResponse,
  SharedUserServiceClient,
} from 'src/external-services/shared-user-service/shared-user-service.client';
import { batchLookupSharedUserIdentities } from 'src/user/user.helper';

type IdentityMap = Map<string, SharedUserLookupResponse>;

// Ten hien thi tu identity cua shared-user. Bo phan rong thay vi in
// "null"/"undefined" nhu khi ghep thang hai cot cuc bo.
const fullNameOf = (identity: SharedUserLookupResponse): string =>
  [identity.firstName, identity.lastName].filter(Boolean).join(' ');

/**
 * Buoc 4.2 - ho ten va ngon ngu cua nguoi nhan/gui thong bao lay tu
 * shared-user (nguon that), KHONG doc `firstName`/`lastName`/`language` tren
 * hang `user_tbl` cuc bo (ban sao cu, co the rong). Moi ham gom moi nguoi can
 * dung roi tra MOT luot `batch-lookup` - khong goi tung nguoi trong vong lap.
 *
 * Chinh sach loi (progress/trend-api.md 4-b):
 *   - DUONG HANG LOAT (moi ham tru `sendNotificationForCustomerToGetOrder`):
 *     chay SAU khi thao tac chinh da ghi xong (doi trang thai mon, thanh toan,
 *     in loi, dat ban...), nen loi o day KHONG duoc nem ra lam hong thao
 *     tac do. Nguoi khong tra duoc => bo qua + ghi log, phan con lai cua lo
 *     van gui. shared-user khong tra loi => ca lo bi bo qua (log loi goc da do
 *     `batchLookupSharedUserIdentities` ghi). Khong bao gio gui thong bao mang
 *     ten trong hay ngon ngu doan.
 *   - `sendNotificationForCustomerToGetOrder` do nhan vien bam truc tiep va
 *     chua ghi gi truoc do => tra loi ro (503 / USER_NOT_FOUND) thay vi bao
 *     thanh cong ma khong gui.
 *
 * Khong phai identity, giu nguyen: `receiverId`/`senderId` (id CUC BO, ghi vao
 * `notification_tbl`), `language` cua ban ghi thong bao (snapshot luc gui).
 */
@Injectable()
export class NotificationUtils {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationProducer: NotificationProducer,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    private readonly notificationLanguageService: NotificationLanguageService,
    private readonly systemConfigService: SystemConfigService,
    private readonly sharedUserServiceClient: SharedUserServiceClient,
  ) {}

  /**
   * Get the frontend URL
   * @returns {Promise<string>} The frontend URL
   */
  async getFrontendUrl(): Promise<string> {
    const context = `${NotificationUtils.name}.${this.getFrontendUrl.name}`;
    const frontEndUrl = await this.systemConfigService.get(
      SystemConfigKey.FRONTEND_URL,
    );
    if (!frontEndUrl) {
      this.logger.error(
        SystemConfigValidation.SYSTEM_CONFIG_NOT_FOUND,
        context,
      );
      return '';
    }
    return frontEndUrl;
  }

  /**
   * Mot luot `batch-lookup` cho moi nguoi cua lo. Duong hang loat: shared-user
   * khong tra loi thi tra Map rong (moi nguoi bi bo qua), khong nem ra.
   */
  private async lookupIdentities(
    users: Array<User | null | undefined>,
    context: string,
  ): Promise<IdentityMap> {
    try {
      return await batchLookupSharedUserIdentities(
        users.map((user) => user?.sharedUserId),
        this.sharedUserServiceClient,
        this.logger,
        context,
      );
    } catch {
      // Nguyen nhan goc da duoc batchLookupSharedUserIdentities ghi log.
      return new Map();
    }
  }

  /** Identity da tra cua mot nguoi; khong co thi ghi log ai bi bo qua. */
  private identityOf(
    identities: IdentityMap,
    user: User | null | undefined,
    context: string,
  ): SharedUserLookupResponse | undefined {
    if (!user) return undefined;
    const identity = identities.get(user.sharedUserId);
    if (!identity) {
      this.logger.warn(
        `Skip notification for user ${user.id}: no shared-user identity for sharedUserId ${user.sharedUserId}`,
        context,
      );
    }
    return identity;
  }

  /** Cap (hang cuc bo, identity) cho nhung nguoi tra duoc - bo qua phan con lai. */
  private withIdentities(
    users: User[],
    identities: IdentityMap,
    context: string,
  ): Array<[User, SharedUserLookupResponse]> {
    return users.flatMap((user): Array<[User, SharedUserLookupResponse]> => {
      const identity = this.identityOf(identities, user, context);
      return identity ? [[user, identity]] : [];
    });
  }

  async sendNotificationAfterOrderIsPaid(order: Order) {
    const context = `${NotificationUtils.name}.${this.sendNotificationAfterOrderIsPaid.name}`;
    // Get all chef role users in the same branch
    const chefRoleUsers = await this.userRepository.find({
      where: {
        role: {
          name: RoleEnum.Chef,
        },
        branch: {
          id: order.branch.id,
        },
      },
    });

    const identities = await this.lookupIdentities(
      [...chefRoleUsers, order.owner],
      context,
    );

    const notificationData = this.withIdentities(
      chefRoleUsers,
      identities,
      context,
    ).map(([chef, identity]) => ({
      message: NotificationMessageCode.ORDER_NEEDS_PROCESSED,
      receiverId: chef.id,
      receiverName: fullNameOf(identity),
      type: NotificationType.ORDER,
      metadata: {
        order: order.slug,
        orderType: order.type,
        tableName: order.table?.name,
        table: order.table?.slug,
        branchName: order.branch?.name,
        branch: order.branch?.slug,
        referenceNumber: order.referenceNumber.toString(),
        createdAt: order.createdAt.toISOString(),
      },
    }));

    const ownerIdentity = this.identityOf(identities, order.owner, context);
    if (ownerIdentity) {
      notificationData.push({
        message: NotificationMessageCode.ORDER_PAID,
        receiverId: order.owner.id,
        receiverName: fullNameOf(ownerIdentity),
        type: NotificationType.ORDER,
        metadata: {
          order: order.slug,
          orderType: order.type,
          tableName: order.table?.name,
          table: order.table?.slug,
          branchName: order.branch?.name,
          branch: order.branch?.slug,
          referenceNumber: order.referenceNumber.toString(),
          createdAt: order.createdAt.toISOString(),
        },
      });
    }

    // Send notification to all chef role users in the same branch
    await this.notificationProducer.bulkCreateNotification(notificationData);
  }

  async sendNotificationAfterOrderIsProcessed(order: Order) {
    const context = `${NotificationUtils.name}.${this.sendNotificationAfterOrderIsProcessed.name}`;
    // Create notification to send to staffs in the same branch
    const staffs = await this.userRepository.find({
      where: {
        role: {
          name: In([RoleEnum.Staff, RoleEnum.Cashier]),
        },
        branch: {
          id: order.branch?.id,
        },
      },
    });

    const identities = await this.lookupIdentities(staffs, context);

    const notificationData = this.withIdentities(
      staffs,
      identities,
      context,
    ).map(([staff, identity]) => ({
      message: NotificationMessageCode.ORDER_NEEDS_DELIVERED,
      receiverId: staff.id,
      type: NotificationType.ORDER,
      receiverName: fullNameOf(identity),
      metadata: {
        order: order?.slug,
        orderType: order?.type,
        tableName: order?.table?.name,
        table: order?.table?.slug,
        branchName: order?.branch?.name,
        branch: order?.branch?.slug,
        referenceNumber: order.referenceNumber.toString(),
        createdAt: order.createdAt.toISOString(),
      },
    }));

    await this.notificationProducer.bulkCreateNotification(notificationData);
  }

  async sendNotificationForCustomerToGetOrder(
    createdById: string,
    order: Order,
  ) {
    const context = `${NotificationUtils.name}.${this.sendNotificationForCustomerToGetOrder.name}`;
    // Create notification to send to staffs in the same branch
    const customer = await this.userRepository.findOne({
      where: {
        id: order.owner.id,
      },
      relations: { role: true },
    });

    if (!customer) {
      this.logger.error(UserValidation.USER_NOT_FOUND, context);
      throw new UserException(UserValidation.USER_NOT_FOUND);
    }

    if (!isDefinedCustomer(customer)) {
      this.logger.error(NotificationValidation.RECEIVER_NOT_FOUND, context);
      throw new NotificationException(
        NotificationValidation.RECEIVER_NOT_FOUND,
      );
    }

    const sender = await this.userRepository.findOne({
      where: { id: createdById },
    });

    if (!sender) {
      this.logger.error(NotificationValidation.SENDER_NOT_FOUND);
      throw new NotificationException(NotificationValidation.SENDER_NOT_FOUND);
    }

    // Nhan vien bam truc tiep, chua ghi gi => khong nuot loi: shared-user
    // khong tra loi thi 503 (SharedUserUnavailableException), khong co
    // identity thi cung ma loi nhu khi thieu hang cuc bo.
    const identities = await batchLookupSharedUserIdentities(
      [customer.sharedUserId, sender.sharedUserId],
      this.sharedUserServiceClient,
      this.logger,
      context,
    );
    const customerIdentity = identities.get(customer.sharedUserId);
    if (!customerIdentity) {
      this.logger.error(
        `${UserValidation.USER_NOT_FOUND.message}: no shared-user identity for sharedUserId ${customer.sharedUserId}`,
        context,
      );
      throw new UserException(UserValidation.USER_NOT_FOUND);
    }
    const senderIdentity = identities.get(sender.sharedUserId);
    if (!senderIdentity) {
      this.logger.error(
        `${NotificationValidation.SENDER_NOT_FOUND.message}: no shared-user identity for sharedUserId ${sender.sharedUserId}`,
        context,
      );
      throw new NotificationException(NotificationValidation.SENDER_NOT_FOUND);
    }

    const notificationMessage = this.notificationLanguageService.format(
      NotificationMessageCode.ORDER_NEEDS_READY_TO_GET,
      { referenceNumber: order.referenceNumber.toString() },
      customerIdentity.language,
    );

    const frontEndUrl = await this.getFrontendUrl();

    const notificationData = {
      message: NotificationMessageCode.ORDER_NEEDS_READY_TO_GET,
      receiverId: customer.id,
      type: NotificationType.ORDER,
      receiverName: fullNameOf(customerIdentity),
      senderId: sender.id,
      senderName: fullNameOf(senderIdentity),
      title: notificationMessage.title,
      body: notificationMessage.body,
      language: customerIdentity.language,
      link: `${frontEndUrl}/history?order=${order.slug}`,
      metadata: {
        order: order.slug,
        orderType: order.type,
        tableName: order.table?.name,
        table: order.table?.slug,
        branchName: order.branch?.name,
        branch: order.branch?.slug,
        referenceNumber: order.referenceNumber.toString(),
        createdAt: order.createdAt.toISOString(),
      },
    };
    await this.notificationProducer.createNotification(notificationData);
  }

  async sendNotificationForAllBranchStaffsWhenFailedBillPrinting(order: Order) {
    const context = `${NotificationUtils.name}.${this.sendNotificationForAllBranchStaffsWhenFailedBillPrinting.name}`;
    // Create notification to send to staffs in the same branch
    const staffs = await this.userRepository.find({
      where: {
        role: {
          name: In([
            RoleEnum.Staff,
            RoleEnum.Cashier,
            RoleEnum.Chef,
            RoleEnum.Manager,
          ]),
        },
        branch: {
          id: order.branch?.id,
        },
      },
    });

    const identities = await this.lookupIdentities(staffs, context);
    const frontEndUrl = await this.getFrontendUrl();

    const notificationData = this.withIdentities(
      staffs,
      identities,
      context,
    ).map(([staff, identity]) => {
      const notificationMessage = this.notificationLanguageService.format(
        NotificationMessageCode.ORDER_BILL_FAILED_PRINTING,
        { referenceNumber: order.referenceNumber.toString() },
        identity.language,
      );

      return {
        message: NotificationMessageCode.ORDER_BILL_FAILED_PRINTING,
        receiverId: staff.id,
        type: NotificationType.ORDER,
        receiverName: fullNameOf(identity),
        title: notificationMessage.title,
        body: notificationMessage.body,
        language: identity.language,
        link: `${frontEndUrl}/system/order-management?order=${order.slug}`,
        metadata: {
          order: order.slug,
          orderType: order.type,
          tableName: order.table?.name,
          table: order.table?.slug,
          branchName: order.branch?.name,
          branch: order.branch?.slug,
          referenceNumber: order.referenceNumber.toString(),
          createdAt: order.createdAt.toISOString(),
        },
      };
    });

    await this.notificationProducer.bulkCreateNotification(notificationData);
  }

  async sendNotificationForAllBranchStaffsWhenFailedChefOrderPrinting(
    order: Order,
  ) {
    const context = `${NotificationUtils.name}.${this.sendNotificationForAllBranchStaffsWhenFailedChefOrderPrinting.name}`;
    // Create notification to send to staffs in the same branch
    const staffs = await this.userRepository.find({
      where: {
        role: {
          name: In([
            RoleEnum.Staff,
            RoleEnum.Cashier,
            RoleEnum.Chef,
            RoleEnum.Manager,
          ]),
        },
        branch: {
          id: order.branch?.id,
        },
      },
    });

    const identities = await this.lookupIdentities(staffs, context);
    const frontEndUrl = await this.getFrontendUrl();

    const notificationData = this.withIdentities(
      staffs,
      identities,
      context,
    ).map(([staff, identity]) => {
      const notificationMessage = this.notificationLanguageService.format(
        NotificationMessageCode.ORDER_CHEF_ORDER_FAILED_PRINTING,
        { referenceNumber: order.referenceNumber.toString() },
        identity.language,
      );

      return {
        message: NotificationMessageCode.ORDER_CHEF_ORDER_FAILED_PRINTING,
        receiverId: staff.id,
        type: NotificationType.ORDER,
        receiverName: fullNameOf(identity),
        title: notificationMessage.title,
        body: notificationMessage.body,
        language: identity.language,
        link: `${frontEndUrl}/system/chef-order`,
        metadata: {
          order: order.slug,
          orderType: order.type,
          tableName: order.table?.name,
          table: order.table?.slug,
          branchName: order.branch?.name,
          branch: order.branch?.slug,
          referenceNumber: order.referenceNumber.toString(),
          createdAt: order.createdAt.toISOString(),
        },
      };
    });

    await this.notificationProducer.bulkCreateNotification(notificationData);
  }

  async sendNotificationForAllBranchStaffsWhenFailedLabelTicketPrinting(
    order: Order,
  ) {
    const context = `${NotificationUtils.name}.${this.sendNotificationForAllBranchStaffsWhenFailedLabelTicketPrinting.name}`;
    // Create notification to send to staffs in the same branch
    const staffs = await this.userRepository.find({
      where: {
        role: {
          name: In([
            RoleEnum.Staff,
            RoleEnum.Cashier,
            RoleEnum.Chef,
            RoleEnum.Manager,
          ]),
        },
        branch: {
          id: order.branch?.id,
        },
      },
    });

    const identities = await this.lookupIdentities(staffs, context);
    const frontEndUrl = await this.getFrontendUrl();

    const notificationData = this.withIdentities(
      staffs,
      identities,
      context,
    ).map(([staff, identity]) => {
      const notificationMessage = this.notificationLanguageService.format(
        NotificationMessageCode.ORDER_LABEL_TICKET_FAILED_PRINTING,
        { referenceNumber: order.referenceNumber.toString() },
        identity.language,
      );

      return {
        message: NotificationMessageCode.ORDER_LABEL_TICKET_FAILED_PRINTING,
        receiverId: staff.id,
        type: NotificationType.ORDER,
        receiverName: fullNameOf(identity),
        title: notificationMessage.title,
        body: notificationMessage.body,
        language: identity.language,
        link: `${frontEndUrl}/system/chef-order`,
        metadata: {
          order: order.slug,
          orderType: order.type,
          tableName: order.table?.name,
          table: order.table?.slug,
          branchName: order.branch?.name,
          branch: order.branch?.slug,
          referenceNumber: order.referenceNumber.toString(),
          createdAt: order.createdAt.toISOString(),
        },
      };
    });

    await this.notificationProducer.bulkCreateNotification(notificationData);
  }

  async sendNotificationAfterCardOrderIsPaid(cardOrder: CardOrder) {
    const context = `${NotificationUtils.name}.${this.sendNotificationAfterCardOrderIsPaid.name}`;

    const customer = await this.userRepository.findOne({
      where: { id: cardOrder.customerId },
    });

    if (!customer) {
      this.logger.error(
        `Customer not found for card order ${cardOrder.slug}`,
        context,
      );
      return;
    }

    const identities = await this.lookupIdentities([customer], context);
    const customerIdentity = this.identityOf(identities, customer, context);
    if (!customerIdentity) return;

    const frontEndUrl = await this.getFrontendUrl();

    const notificationMessage = this.notificationLanguageService.format(
      NotificationMessageCode.CARD_ORDER_PAID,
      {
        cardTitle: cardOrder.cardTitle,
        orderCode: cardOrder.code,
      },
      customerIdentity.language,
    );

    const notificationData = {
      message: NotificationMessageCode.CARD_ORDER_PAID,
      receiverId: customer.id,
      receiverName: fullNameOf(customerIdentity),
      type: NotificationType.CARD_ORDER,
      title: notificationMessage.title,
      body: notificationMessage.body,
      language: customerIdentity.language,
      link: `${frontEndUrl}/profile/gift-card`,
      metadata: {
        cardOrder: cardOrder.slug,
        cardOrderCode: cardOrder.code,
        cardTitle: cardOrder.cardTitle,
        totalAmount: cardOrder.totalAmount?.toString(),
        createdAt: cardOrder.createdAt?.toISOString(),
      },
    };

    await this.notificationProducer.createNotification(notificationData);
  }

  /**
   * Format a booking date into a readable `HH:mm DD/MM/YYYY` string.
   * @param {Date} date - The booking date
   * @returns {string} The formatted date
   */
  private formatBookingDate(date: Date): string {
    if (!date) return '';
    const pad = (value: number) => value.toString().padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())} ${pad(
      date.getDate(),
    )}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  }

  /**
   * Build the metadata payload for a table booking notification.
   * @param {TableBookingEntity} booking - The table booking
   * @returns {Record<string, any>} The metadata payload
   */
  private buildTableBookingMetadata(
    booking: TableBookingEntity,
  ): Record<string, any> {
    return {
      tableBooking: booking.slug,
      customerName: booking.name,
      phone: booking.phone,
      status: booking.status,
      seats: booking.seats ?? undefined,
      table: booking.table ?? undefined,
      date: booking.date?.toISOString(),
      createdAt: booking.createdAt?.toISOString(),
    };
  }

  /**
   * Resolve the staff members responsible for handling table bookings.
   * Bookings are not tied to a branch, so every telesale/manager/admin is
   * notified.
   * @returns {Promise<User[]>} The staff users
   */
  private async getTableBookingStaffs(): Promise<User[]> {
    return this.userRepository.find({
      where: {
        role: {
          name: In([RoleEnum.Telesale, RoleEnum.Manager, RoleEnum.Admin]),
        },
      },
    });
  }

  /**
   * Notify staff when a new table booking is created and needs confirmation.
   * @param {TableBookingEntity} booking - The newly created table booking
   */
  async sendNotificationAfterTableBookingIsCreated(
    booking: TableBookingEntity,
  ) {
    const context = `${NotificationUtils.name}.${this.sendNotificationAfterTableBookingIsCreated.name}`;
    const staffs = await this.getTableBookingStaffs();
    if (staffs.length === 0) return;
    const identities = await this.lookupIdentities(staffs, context);

    const frontEndUrl = await this.getFrontendUrl();
    const bookingTime = this.formatBookingDate(booking.date);
    const metadata = this.buildTableBookingMetadata(booking);

    const notificationData = this.withIdentities(
      staffs,
      identities,
      context,
    ).map(([staff, identity]) => {
      const notificationMessage = this.notificationLanguageService.format(
        NotificationMessageCode.TABLE_BOOKING_CREATED,
        {
          customerPhoneNumber: booking.phone,
          bookingTime,
          seats: booking.seats ?? '',
        },
        identity.language,
      );

      return {
        message: NotificationMessageCode.TABLE_BOOKING_CREATED,
        receiverId: staff.id,
        receiverName: fullNameOf(identity),
        type: NotificationType.TABLE_BOOKING,
        title: notificationMessage.title,
        body: notificationMessage.body,
        language: identity.language,
        link: `${frontEndUrl}/system/table-booking?booking=${booking.slug}`,
        metadata,
      };
    });

    await this.notificationProducer.bulkCreateNotification(notificationData);
  }

  /**
   * Notify staff when a table booking has been confirmed.
   * @param {TableBookingEntity} booking - The confirmed table booking
   */
  async sendNotificationAfterTableBookingIsConfirmed(
    booking: TableBookingEntity,
  ) {
    const context = `${NotificationUtils.name}.${this.sendNotificationAfterTableBookingIsConfirmed.name}`;
    const staffs = await this.getTableBookingStaffs();
    if (staffs.length === 0) return;
    const identities = await this.lookupIdentities(staffs, context);

    const frontEndUrl = await this.getFrontendUrl();
    const bookingTime = this.formatBookingDate(booking.date);
    const metadata = this.buildTableBookingMetadata(booking);

    const notificationData = this.withIdentities(
      staffs,
      identities,
      context,
    ).map(([staff, identity]) => {
      const notificationMessage = this.notificationLanguageService.format(
        NotificationMessageCode.TABLE_BOOKING_CONFIRMED,
        {
          customerPhoneNumber: booking.phone,
          bookingTime,
        },
        identity.language,
      );

      return {
        message: NotificationMessageCode.TABLE_BOOKING_CONFIRMED,
        receiverId: staff.id,
        receiverName: fullNameOf(identity),
        type: NotificationType.TABLE_BOOKING,
        title: notificationMessage.title,
        body: notificationMessage.body,
        language: identity.language,
        link: `${frontEndUrl}/system/table-booking?booking=${booking.slug}`,
        metadata,
      };
    });

    await this.notificationProducer.bulkCreateNotification(notificationData);
  }
}
