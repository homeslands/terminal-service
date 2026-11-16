import { Injectable, Logger } from '@nestjs/common';
import { User } from 'src/user/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { Inject } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { SystemConfigService } from 'src/system-config/system-config.service';
import { PrinterEventProducer } from './printer-event.producer';
import { RoleEnum } from 'src/role/role.enum';
import { Order } from 'src/order/order.entity';
import { PrinterEventLanguageService } from './printer-event-language.service';
import {
  PrinterEventMessageCode,
  PrinterEventRetryStatus,
} from './printer-event.constants';
import { PrinterEventType } from './printer-event.constants';
import { PrinterEvent } from '../entity/printer-event.entity';
import { SystemConfigKey } from 'src/system-config/system-config.constant';
import { SystemConfigValidation } from 'src/system-config/system-config.validation';
import { PrinterJob } from '../entity/printer-job.entity';
import _ from 'lodash';
import {
  FeatureFlagSystems,
  FeatureSystemGroups,
} from 'src/feature-flag-system/feature-flag-system.constant';
import { FeatureFlagSystemService } from 'src/feature-flag-system/feature-flag-system.service';
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
 * Buoc 4.3 - ho ten va ngon ngu cua nhan vien nhan canh bao "in loi" lay tu
 * shared-user (nguon that), KHONG doc `firstName`/`lastName`/`language` tren
 * hang `user_tbl` cuc bo. Moi ham tra MOT luot `batch-lookup` cho ca nhom.
 *
 * Cac ham o day KHONG dung noi dung phieu in: chung tao canh bao cho nhan vien
 * SAU KHI lenh in da hong (printer job da ghi FAILED). Ten duy nhat in len
 * chung tu la o hoa don - buoc 4.5 (`invoice.service.ts`).
 *
 * Chinh sach loi - fail-closed theo nghia KHONG phat canh bao thieu ten
 * (progress/trend-api.md 4-c):
 *   - Nguoi khong tra duoc => bo qua nguoi do + `warn`.
 *   - shared-user khong tra loi => KHONG phat canh bao nao, ghi MOT dong loi
 *     neu ro printer job, KHONG nem ra. Nem ra o day hai luong in: o
 *     `printer-legacy.worker.ts` loi bay khoi vong `while` thi bo qua
 *     `lockLabelTicket.release()` (khoa may in toi het TTL), va o nhanh "lock
 *     het han" (trong `try`) thi roi vao `catch` cua lan in => in LAI; o
 *     `printer.consumer.ts` thi lam hong `handleFinalFailure` sau khi job da
 *     ghi FAILED. Trang thai FAILED cua printer job van con de tra cuu.
 *
 * Khong phai identity, giu nguyen: `receiverId` (id CUC BO - khop
 * `existedPrinterEvent`), `language` cua ban ghi su kien (snapshot luc gui).
 */
@Injectable()
export class PrinterEventUtils {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(PrinterJob)
    private readonly printerJobRepository: Repository<PrinterJob>,
    private readonly printerEventProducer: PrinterEventProducer,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    private readonly printerEventLanguageService: PrinterEventLanguageService,
    private readonly systemConfigService: SystemConfigService,
    @InjectRepository(PrinterEvent)
    private readonly printerEventRepository: Repository<PrinterEvent>,
    private readonly featureFlagSystemService: FeatureFlagSystemService,
    private readonly sharedUserServiceClient: SharedUserServiceClient,
  ) {}

  /**
   * Mot luot `batch-lookup` cho ca nhom nhan vien nhan canh bao. shared-user
   * khong tra loi => `null`: ben goi khong phat canh bao nao (mot dong loi o
   * day, khong canh bao tung nguoi), khong nem ra.
   */
  private async lookupStaffIdentities(
    staffs: User[],
    printerJobId: string,
    context: string,
  ): Promise<IdentityMap | null> {
    try {
      return await batchLookupSharedUserIdentities(
        staffs.map((staff) => staff.sharedUserId),
        this.sharedUserServiceClient,
        this.logger,
        context,
      );
    } catch {
      // Nguyen nhan goc da duoc batchLookupSharedUserIdentities ghi log.
      this.logger.error(
        `Skip failed-printing events of printer job ${printerJobId} for ${staffs.length} staff: shared-user identities unavailable, no event is sent without a name`,
        context,
      );
      return null;
    }
  }

  /** Cap (hang cuc bo, identity) cho nhung nguoi tra duoc - bo qua phan con lai. */
  private withIdentities(
    staffs: User[],
    identities: IdentityMap,
    context: string,
  ): Array<[User, SharedUserLookupResponse]> {
    return staffs.flatMap((staff): Array<[User, SharedUserLookupResponse]> => {
      const identity = identities.get(staff.sharedUserId);
      if (!identity) {
        this.logger.warn(
          `Skip printer event for user ${staff.id}: no shared-user identity for sharedUserId ${staff.sharedUserId}`,
          context,
        );
        return [];
      }
      return [[staff, identity]];
    });
  }

  /**
   * Get the frontend URL
   * @returns {Promise<string>} The frontend URL
   */
  async getFrontendUrl(): Promise<string> {
    const context = `${PrinterEventUtils.name}.${this.getFrontendUrl.name}`;
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

  async sendPrinterEventForAllBranchStaffsWhenFailedBillPrinting(
    order: Order,
    printerJobId: string,
  ) {
    const context = `${PrinterEventUtils.name}.${this.sendPrinterEventForAllBranchStaffsWhenFailedBillPrinting.name}`;
    const isLockedFeature = await this.featureFlagSystemService.isLockedFeature(
      FeatureSystemGroups.PRINTER,
      FeatureFlagSystems.PRINTER.EVENT_FAILED_PRINTING.key,
      FeatureFlagSystems.PRINTER.EVENT_FAILED_PRINTING.children.PRINT_INVOICE
        .key,
    );
    if (isLockedFeature) return;

    const printerJob = await this.printerJobRepository.findOne({
      where: { id: printerJobId },
      relations: { printerEvents: true },
    });
    if (!printerJob) return;

    // Create notification to send to staffs in the same branch
    const staffs = await this.userRepository.find({
      where: {
        role: {
          name: In([RoleEnum.Staff, RoleEnum.Chef, RoleEnum.Manager]),
        },
        branch: {
          id: order.branch?.id,
        },
      },
    });

    const identities = await this.lookupStaffIdentities(
      staffs,
      printerJob.id,
      context,
    );
    if (!identities) return;

    const frontEndUrl = await this.getFrontendUrl();

    const printerEventData = this.withIdentities(
      staffs,
      identities,
      context,
    ).map(([staff, identity]) => {
      const notificationMessage = this.printerEventLanguageService.format(
        PrinterEventMessageCode.INVOICE_FAILED_PRINTING,
        { referenceNumber: order.referenceNumber.toString() },
        identity.language,
      );

      let existedPrinterEvent = null;
      const event = printerJob.printerEvents.find(
        (event) => event.receiverId === staff.id,
      );
      if (event) {
        existedPrinterEvent = event.id;
      }

      return {
        message: PrinterEventMessageCode.INVOICE_FAILED_PRINTING,
        receiverId: staff.id,
        type: PrinterEventType.INVOICE,
        receiverName: fullNameOf(identity),
        title: notificationMessage.title,
        body: notificationMessage.body,
        language: identity.language,
        link: `${frontEndUrl}/system/order-management?order=${order.slug}`,
        existedPrinterEvent,
        printerJobId: printerJob.id,
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

    await this.printerEventProducer.bulkCreatePrinterEvent(printerEventData);
  }

  async sendPrinterEventForAllBranchStaffsWhenFailedChefOrderPrinting(
    chefOrderSlug: string,
    order: Order,
    printerJobId: string,
  ) {
    const context = `${PrinterEventUtils.name}.${this.sendPrinterEventForAllBranchStaffsWhenFailedChefOrderPrinting.name}`;
    const isLockedFeature = await this.featureFlagSystemService.isLockedFeature(
      FeatureSystemGroups.PRINTER,
      FeatureFlagSystems.PRINTER.EVENT_FAILED_PRINTING.key,
      FeatureFlagSystems.PRINTER.EVENT_FAILED_PRINTING.children.PRINT_CHEF_ORDER
        .key,
    );
    if (isLockedFeature) return;

    const printerJob = await this.printerJobRepository.findOne({
      where: { id: printerJobId },
      relations: { printerEvents: true },
    });
    if (!printerJob) return;

    // Create notification to send to staffs in the same branch
    const staffs = await this.userRepository.find({
      where: {
        role: {
          name: In([RoleEnum.Staff, RoleEnum.Chef, RoleEnum.Manager]),
        },
        branch: {
          id: order.branch?.id,
        },
      },
    });

    const identities = await this.lookupStaffIdentities(
      staffs,
      printerJob.id,
      context,
    );
    if (!identities) return;

    const frontEndUrl = await this.getFrontendUrl();

    const printerEventData = this.withIdentities(
      staffs,
      identities,
      context,
    ).map(([staff, identity]) => {
      const notificationMessage = this.printerEventLanguageService.format(
        PrinterEventMessageCode.CHEF_ORDER_FAILED_PRINTING,
        { referenceNumber: order.referenceNumber.toString() },
        identity.language,
      );

      let existedPrinterEvent = null;
      const event = printerJob.printerEvents.find(
        (event) => event.receiverId === staff.id,
      );
      if (event) {
        existedPrinterEvent = event.id;
      }

      return {
        message: PrinterEventMessageCode.CHEF_ORDER_FAILED_PRINTING,
        receiverId: staff.id,
        type: PrinterEventType.CHEF_ORDER,
        receiverName: fullNameOf(identity),
        title: notificationMessage.title,
        body: notificationMessage.body,
        language: identity.language,
        link: `${frontEndUrl}/system/chef-order`,
        existedPrinterEvent,
        printerJobId: printerJob.id,
        metadata: {
          order: order.slug,
          chefOrder: chefOrderSlug,
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

    await this.printerEventProducer.bulkCreatePrinterEvent(printerEventData);
  }

  async sendPrinterEventForAllBranchStaffsWhenFailedLabelTicketPrinting(
    chefOrderSlug: string,
    order: Order,
    printerJobId: string,
  ) {
    const context = `${PrinterEventUtils.name}.${this.sendPrinterEventForAllBranchStaffsWhenFailedLabelTicketPrinting.name}`;
    const isLockedFeature = await this.featureFlagSystemService.isLockedFeature(
      FeatureSystemGroups.PRINTER,
      FeatureFlagSystems.PRINTER.EVENT_FAILED_PRINTING.key,
      FeatureFlagSystems.PRINTER.EVENT_FAILED_PRINTING.children
        .PRINT_LABEL_TICKET.key,
    );
    if (isLockedFeature) return;

    const printerJob = await this.printerJobRepository.findOne({
      where: { id: printerJobId },
      relations: { printerEvents: true },
    });
    if (!printerJob) return;

    // Create notification to send to staffs in the same branch
    const staffs = await this.userRepository.find({
      where: {
        role: {
          name: In([RoleEnum.Staff, RoleEnum.Chef, RoleEnum.Manager]),
        },
        branch: {
          id: order.branch?.id,
        },
      },
    });

    const identities = await this.lookupStaffIdentities(
      staffs,
      printerJob.id,
      context,
    );
    if (!identities) return;

    const frontEndUrl = await this.getFrontendUrl();

    const printerEventData = this.withIdentities(
      staffs,
      identities,
      context,
    ).map(([staff, identity]) => {
      const notificationMessage = this.printerEventLanguageService.format(
        PrinterEventMessageCode.LABEL_TICKET_FAILED_PRINTING,
        { referenceNumber: order.referenceNumber.toString() },
        identity.language,
      );

      let existedPrinterEvent = null;
      const event = printerJob.printerEvents.find(
        (event) => event.receiverId === staff.id,
      );
      if (event) {
        existedPrinterEvent = event.id;
      }

      return {
        message: PrinterEventMessageCode.LABEL_TICKET_FAILED_PRINTING,
        receiverId: staff.id,
        type: PrinterEventType.LABEL_TICKET,
        receiverName: fullNameOf(identity),
        title: notificationMessage.title,
        body: notificationMessage.body,
        language: identity.language,
        link: `${frontEndUrl}/system/chef-order`,
        existedPrinterEvent,
        printerJobId: printerJob.id,
        metadata: {
          order: order.slug,
          chefOrder: chefOrderSlug,
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

    await this.printerEventProducer.bulkCreatePrinterEvent(printerEventData);
  }

  async updatePrinterEventRetryStatusToSuccess(
    printerJobId: string,
    manager: EntityManager,
  ) {
    const printerEvents = await manager.find(PrinterEvent, {
      where: { printerJob: { id: printerJobId } },
    });
    if (_.isEmpty(printerEvents)) return;

    printerEvents.forEach((printerEvent) => {
      printerEvent.retryStatus = PrinterEventRetryStatus.SUCCESS;
    });

    await manager.save(printerEvents);
  }
}
