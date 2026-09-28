import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { QueueRegisterKey } from 'src/app/app.constants';
import { Job as BullJob } from 'bullmq';
import { CreatePrintJobRequestDto } from './printer.dto';
import { PrinterUtils } from './printer.utils';
import { PrinterJobStatus, PrinterJobType } from './printer.constants';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import PrinterValidation from './printer.validation';
import { PrinterException } from './printer.exception';
import { SystemConfigService } from 'src/system-config/system-config.service';
import { SystemConfigKey } from 'src/system-config/system-config.constant';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PrinterJob } from './entity/printer-job.entity';
import { ChefOrder } from 'src/chef-order/chef-order.entity';
import { Order } from 'src/order/order.entity';
import { PrinterConnectorUtils } from 'src/printer-connector/printer-connector.utils';
import { Printer } from './entity/printer.entity';
import { PrinterDataType } from './printer.constants';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { PrinterEventUtils } from './printer-event/printer-event.utils';
import moment from 'moment';

@Processor(QueueRegisterKey.PRINTER)
@Injectable()
export class PrinterConsumer extends WorkerHost {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    // Legacy dependencies
    private readonly printerUtils: PrinterUtils,
    private readonly systemConfigService: SystemConfigService,
    // Hybrid mode dependencies
    @InjectRepository(PrinterJob)
    private readonly printerJobRepository: Repository<PrinterJob>,
    @InjectRepository(ChefOrder)
    private readonly chefOrderRepository: Repository<ChefOrder>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Printer)
    private readonly printerRepository: Repository<Printer>,
    private readonly printerConnectorUtils: PrinterConnectorUtils,
    private readonly transactionManagerService: TransactionManagerService,
    private readonly printerEventUtils: PrinterEventUtils,
  ) {
    super();
  }

  async process(job: BullJob): Promise<any> {
    if (job.data.printerJobId) {
      await this.processHybrid(job as BullJob<{ printerJobId: string }>);
    } else {
      await this.processLegacy(job as BullJob<CreatePrintJobRequestDto>);
    }
  }

  private async findInvoicePrinters(branchId: string): Promise<Printer[]> {
    const printers = await this.printerRepository.find({
      where: { invoiceArea: { branch: { id: branchId } }, isActive: true },
      relations: { invoiceArea: { branch: true } },
    });
    return printers.filter((p) => p.printerId);
  }

  // ── Hybrid mode: DB + BullMQ ────────────────────────────────

  private async processHybrid(
    job: BullJob<{ printerJobId: string }>,
  ): Promise<void> {
    const context = `${PrinterConsumer.name}.processHybrid`;
    const { printerJobId } = job.data;

    const printerJob = await this.printerJobRepository.findOne({
      where: { id: printerJobId },
    });

    if (!printerJob) {
      this.logger.warn(`Printer job ${printerJobId} not found`, context);
      return;
    }
    if (
      printerJob.status !== PrinterJobStatus.PENDING &&
      printerJob.status !== PrinterJobStatus.PRINTING
    ) {
      this.logger.warn(
        `Printer job ${printerJobId} status is ${printerJob.status}, skipping`,
        context,
      );
      return;
    }

    await this.printerJobRepository.update(printerJobId, {
      status: PrinterJobStatus.PRINTING,
    });

    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1) - 1;

    try {
      if (printerJob.jobType === PrinterJobType.LABEL_TICKET) {
        await this.processLabelTicket(printerJob, job.attemptsMade);
      } else if (printerJob.jobType === PrinterJobType.CHEF_ORDER) {
        await this.processChefOrder(printerJob, job.attemptsMade);
      } else if (printerJob.jobType === PrinterJobType.INVOICE) {
        await this.processInvoice(printerJob, job.attemptsMade);
      } else {
        this.logger.error(`Unknown job type ${printerJob.jobType}`, context);
        return;
      }
    } catch (error: any) {
      this.logger.error(
        `Attempt ${job.attemptsMade + 1}/${job.opts.attempts} failed for printer job ${printerJobId}`,
        error.stack,
        context,
      );

      if (isLastAttempt) {
        // Final failure: update DB + send events
        await this.handleFinalFailure(printerJob, error);
        return; // Don't throw → BullMQ considers job completed
      }
      // Re-set to PRINTING so recovery cron doesn't interfere during backoff
      throw error; // Throw → BullMQ retries
    }

    // Update DB after printing — separated from the print try-catch so a DB
    // failure here does NOT trigger a BullMQ retry (which would cause duplicate prints)
    try {
      await this.markJobSuccess(printerJobId);
    } catch (dbError: any) {
      this.logger.error(
        `markJobSuccess failed for printer job ${printerJobId}, prints were already sent`,
        dbError.stack,
        context,
      );
    }
  }

  private async processLabelTicket(
    printerJob: PrinterJob,
    attemptsMade: number,
  ): Promise<void> {
    const context = `${PrinterConsumer.name}.processLabelTicket`;

    const chefOrder = await this.chefOrderRepository.findOne({
      where: { id: printerJob.data },
      relations: [
        'chefOrderItems.orderItem.variant.size',
        'chefOrderItems.orderItem.variant.product',
        'order.table',
        'order.branch',
        'chefArea.printers',
        'order.deliveryTo',
      ],
    });

    if (!chefOrder) {
      throw new Error(`Chef order ${printerJob.data} not found`);
    }

    const branchSlug = chefOrder.order?.branch?.slug;
    const isLegacy = await this.isLegacyPrinterSystem();
    const printers = (chefOrder.chefArea?.printers ?? []).filter((p) => {
      if (
        !p.isActive ||
        !p.printerId ||
        p.dataType !== PrinterDataType.TSPL_ZPL
      )
        return false;
      // LEGACY: mỗi job chỉ in trên 1 printer cụ thể (IP được lưu trong job)
      if (isLegacy && printerJob.printerIp)
        return p.ip === printerJob.printerIp;
      return true;
    });
    if (printers.length === 0) {
      throw new Error(
        `No active TSPL_ZPL printer found in chef area ${chefOrder.chefArea?.id}`,
      );
    }
    this.logger.log(
      `Printing label ticket for chef order ${printerJob.data} on ${printers.length} printer(s)`,
      context,
    );
    for (const printer of printers) {
      const copies = isLegacy ? 1 : (printer.numberPrinting ?? 1);
      for (const chefOrderItem of chefOrder.chefOrderItems) {
        const ticketData = {
          referenceNumber: `${chefOrder.order?.slug ?? 'N/A'} ${moment(chefOrder.order?.createdAt).format('DD/MM/YYYY HH:mm')}`,
          chefOrderItemSlug: chefOrderItem.slug,
          createdAt: moment(chefOrder.order?.createdAt).format(
            'DD/MM/YYYY HH:mm:ss',
          ),
          productName:
            chefOrderItem?.orderItem?.variant?.product?.name ?? 'N/A',
          variantName: chefOrderItem?.orderItem?.variant?.size?.name ?? 'N/A',
          note: chefOrderItem?.orderItem?.note ?? '',
        };
        for (let i = 0; i < chefOrderItem.quantity; i++) {
          await this.printerConnectorUtils.printChefOrderItemTicket(
            branchSlug,
            printer.printerId,
            ticketData,
            attemptsMade,
            copies,
            i,
          );
        }
      }
    }
  }

  private async processChefOrder(
    printerJob: PrinterJob,
    attemptsMade: number,
  ): Promise<void> {
    const context = `${PrinterConsumer.name}.processChefOrder`;

    const chefOrder = await this.chefOrderRepository.findOne({
      where: { id: printerJob.data },
      relations: [
        'chefOrderItems.orderItem.variant.size',
        'chefOrderItems.orderItem.variant.product',
        'order.table',
        'order.branch',
        'chefArea.printers',
        'order.deliveryTo',
      ],
    });

    if (!chefOrder) {
      throw new Error(`Chef order ${printerJob.data} not found`);
    }

    const branchSlug = chefOrder.order?.branch?.slug;
    const isLegacy = await this.isLegacyPrinterSystem();
    const printers = (chefOrder.chefArea?.printers ?? []).filter((p) => {
      if (!p.isActive || !p.printerId) return false;
      // LEGACY: mỗi job chỉ in trên 1 printer cụ thể (IP được lưu trong job)
      if (isLegacy && printerJob.printerIp)
        return p.ip === printerJob.printerIp;
      return true;
    });
    if (printers.length === 0) {
      throw new Error(
        `No active printer found in chef area ${chefOrder.chefArea?.id}`,
      );
    }
    this.logger.log(
      `Printing chef order ${printerJob.data} on ${printers.length} printer(s)`,
      context,
    );

    const referenceNumber =
      chefOrder.order?.referenceNumber?.toString() ?? chefOrder.slug;
    let rawBase64: string | null = null;

    for (const printer of printers) {
      const copies = isLegacy ? 1 : (printer.numberPrinting ?? 1);

      if (printer.dataType === PrinterDataType.ESC_POS) {
        if (rawBase64 === null) {
          rawBase64 = await this.printerUtils.createChefOrderEscPosBase64(
            chefOrder.id,
          );
        }
        await this.printerConnectorUtils.printChefOrderPassthrough(
          branchSlug,
          printer.printerId,
          `${referenceNumber}-${chefOrder.slug}-${printer.printerId}`,
          rawBase64,
          attemptsMade,
          copies,
        );
        continue;
      }

      this.logger.warn(
        `Printer ${printer.printerId} is not ESC_POS, skipping chef order`,
        context,
      );
    }
  }

  private async processInvoice(
    printerJob: PrinterJob,
    attemptsMade: number,
  ): Promise<void> {
    const context = `${PrinterConsumer.name}.processInvoice`;

    const order = await this.orderRepository.findOne({
      where: { id: printerJob.data },
      relations: { branch: true },
    });

    if (!order) {
      throw new Error(`Order ${printerJob.data} not found`);
    }

    const branchSlug = order.branch?.slug;
    const isLegacy = await this.isLegacyPrinterSystem();
    const allPrinters = await this.findInvoicePrinters(order.branch?.id);
    const printers = allPrinters.filter((p) => {
      if (isLegacy && printerJob.printerIp)
        return p.ip === printerJob.printerIp;
      return true;
    });
    if (printers.length === 0) {
      throw new Error(
        `No active invoice printer found for branch ${branchSlug}`,
      );
    }
    this.logger.log(
      `Printing invoice for order ${order.slug} on ${printers.length} printer(s)`,
      context,
    );

    const referenceNumber = order.referenceNumber?.toString() ?? order.slug;
    let rawBase64: string | null = null;

    for (const printer of printers) {
      const copies = isLegacy ? 1 : (printer.numberPrinting ?? 1);

      if (printer.dataType === PrinterDataType.ESC_POS) {
        if (rawBase64 === null) {
          rawBase64 = await this.printerUtils.createInvoiceEscPosBase64(
            order.slug,
          );
        }
        await this.printerConnectorUtils.printInvoicePassthrough(
          branchSlug,
          printer.printerId,
          `${referenceNumber}-${printer.printerId}`,
          rawBase64,
          attemptsMade,
          copies,
        );
        continue;
      }

      this.logger.warn(
        `Printer ${printer.printerId} is not ESC_POS, skipping invoice`,
        context,
      );
    }
  }

  private async markJobSuccess(printerJobId: string): Promise<void> {
    const context = `${PrinterConsumer.name}.markJobSuccess`;
    await this.transactionManagerService.execute(
      async (manager) => {
        await this.printerEventUtils.updatePrinterEventRetryStatusToSuccess(
          printerJobId,
          manager,
        );
        await manager.update(
          'terminal_db.printer_job_tbl',
          { id_column: printerJobId },
          { status_column: PrinterJobStatus.PRINTED },
        );
      },
      async () => {
        this.logger.log(`Printer job ${printerJobId} printed`, context);
      },
      (error: any) => {
        this.logger.error(
          `Error updating printer job ${printerJobId}`,
          error.stack,
          context,
        );
      },
    );
  }

  private async handleFinalFailure(
    printerJob: PrinterJob,
    error: any,
  ): Promise<void> {
    const context = `${PrinterConsumer.name}.handleFinalFailure`;
    this.logger.error(
      `All retries exhausted for printer job ${printerJob.id}`,
      error.stack,
      context,
    );

    await this.printerJobRepository.update(printerJob.id, {
      status: PrinterJobStatus.FAILED,
      error: error.message,
    });

    if (printerJob.jobType === PrinterJobType.LABEL_TICKET) {
      const chefOrder = await this.chefOrderRepository.findOne({
        where: { id: printerJob.data },
        relations: ['order.branch', 'order.table'],
      });
      if (chefOrder) {
        await this.printerEventUtils.sendPrinterEventForAllBranchStaffsWhenFailedLabelTicketPrinting(
          chefOrder.slug,
          chefOrder.order,
          printerJob.id,
        );
      }
    } else if (printerJob.jobType === PrinterJobType.CHEF_ORDER) {
      const chefOrder = await this.chefOrderRepository.findOne({
        where: { id: printerJob.data },
        relations: ['order.branch', 'order.table'],
      });
      if (chefOrder) {
        await this.printerEventUtils.sendPrinterEventForAllBranchStaffsWhenFailedChefOrderPrinting(
          chefOrder.slug,
          chefOrder.order,
          printerJob.id,
        );
      }
    } else if (printerJob.jobType === PrinterJobType.INVOICE) {
      const order = await this.orderRepository.findOne({
        where: { id: printerJob.data },
        relations: { branch: true },
      });
      if (order) {
        await this.printerEventUtils.sendPrinterEventForAllBranchStaffsWhenFailedBillPrinting(
          order,
          printerJob.id,
        );
      }
    }
  }

  // ── Legacy mode: direct BullMQ (REDIS mode) ────────────────

  private async processLegacy(
    job: BullJob<CreatePrintJobRequestDto>,
  ): Promise<void> {
    const context = `${PrinterConsumer.name}.processLegacy`;
    const {
      jobType,
      printerIp,
      printerPort,
      bitmapDataList,
      chefOrder,
      orderSlug,
    } = job.data;

    try {
      if (jobType === PrinterJobType.CHEF_ORDER) {
        await this.printerUtils.handlePrintChefOrder(
          printerIp,
          printerPort,
          chefOrder,
        );
      } else if (jobType === PrinterJobType.LABEL_TICKET) {
        if (bitmapDataList && Array.isArray(bitmapDataList)) {
          for (let i = 0; i < bitmapDataList.length; i++) {
            if (
              bitmapDataList[i] &&
              typeof bitmapDataList[i] === 'object' &&
              (bitmapDataList[i] as any).type === 'Buffer'
            ) {
              bitmapDataList[i] = Buffer.from((bitmapDataList[i] as any).data);
            }
          }
        }

        await this.printerUtils.handlePrintChefOrderItemTicket(
          printerIp,
          printerPort,
          bitmapDataList,
        );
      } else if (jobType === PrinterJobType.INVOICE) {
        await this.printerUtils.handlePrintInvoice(
          printerIp,
          printerPort,
          orderSlug,
        );
      }

      const delay = await this.getPrinterDelayTime();
      await new Promise((resolve) => setTimeout(resolve, delay));
      this.logger.log(`Printer job completed after delay ${delay}ms`, context);
    } catch (error: any) {
      this.logger.error(`Error printing job ${jobType}`, error.stack, context);
      throw new PrinterException(PrinterValidation.ERROR_PRINTING_JOB);
    }
  }

  private async isLegacyPrinterSystem(): Promise<boolean> {
    return (
      (await this.systemConfigService.get(SystemConfigKey.PRINTER_SYSTEM)) ===
      'LEGACY'
    );
  }

  private async getPrinterDelayTime(): Promise<number> {
    const delayTime = await this.systemConfigService.get(
      SystemConfigKey.PRINTER_DELAY_TIME,
    );
    return delayTime ? parseInt(delayTime) : 1000;
  }
}
