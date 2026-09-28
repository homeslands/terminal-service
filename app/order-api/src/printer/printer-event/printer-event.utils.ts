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
  ) {}

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

    const frontEndUrl = await this.getFrontendUrl();

    const printerEventData = staffs.map((staff) => {
      const notificationMessage = this.printerEventLanguageService.format(
        PrinterEventMessageCode.INVOICE_FAILED_PRINTING,
        { referenceNumber: order.referenceNumber.toString() },
        staff.language as string,
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
        receiverName: `${staff.firstName} ${staff.lastName}`,
        title: notificationMessage.title,
        body: notificationMessage.body,
        language: staff.language,
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

    const frontEndUrl = await this.getFrontendUrl();

    const printerEventData = staffs.map((staff) => {
      const notificationMessage = this.printerEventLanguageService.format(
        PrinterEventMessageCode.CHEF_ORDER_FAILED_PRINTING,
        { referenceNumber: order.referenceNumber.toString() },
        staff.language as string,
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
        receiverName: `${staff.firstName} ${staff.lastName}`,
        title: notificationMessage.title,
        body: notificationMessage.body,
        language: staff.language,
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

    const frontEndUrl = await this.getFrontendUrl();

    const printerEventData = staffs.map((staff) => {
      const notificationMessage = this.printerEventLanguageService.format(
        PrinterEventMessageCode.LABEL_TICKET_FAILED_PRINTING,
        { referenceNumber: order.referenceNumber.toString() },
        staff.language as string,
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
        receiverName: `${staff.firstName} ${staff.lastName}`,
        title: notificationMessage.title,
        body: notificationMessage.body,
        language: staff.language,
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
