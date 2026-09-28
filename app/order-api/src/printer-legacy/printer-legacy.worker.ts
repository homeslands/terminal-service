import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { PrinterJob } from 'src/printer/entity/printer-job.entity';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import {
  PrinterJobStatus,
  PrinterJobType,
} from 'src/printer/printer.constants';
import _ from 'lodash';
import moment from 'moment';
import Redlock from 'redlock';
import { PrinterUtils } from 'src/printer/printer.utils';
import { ChefOrder } from 'src/chef-order/chef-order.entity';
import { QueueRegisterKey } from 'src/app/app.constants';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import sharp from 'sharp';
import { PdfService } from 'src/pdf/pdf.service';
import { SystemConfigService } from 'src/system-config/system-config.service';
import { SystemConfigKey } from 'src/system-config/system-config.constant';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { PrinterJobQueryResponseDto } from 'src/printer/printer.dto';
import { Order } from 'src/order/order.entity';
import { PrinterEventUtils } from 'src/printer/printer-event/printer-event.utils';

@Injectable()
export class PrinterLegacyWorker implements OnModuleInit {
  private redlock: Redlock;

  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    @InjectRepository(PrinterJob)
    private readonly printerJobRepository: Repository<PrinterJob>,
    private readonly printerUtils: PrinterUtils,
    @InjectRepository(ChefOrder)
    private readonly chefOrderRepository: Repository<ChefOrder>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectQueue(QueueRegisterKey.PRINTER)
    private readonly printerQueue: Queue,
    private readonly pdfService: PdfService,
    private readonly systemConfigService: SystemConfigService,
    private readonly transactionManagerService: TransactionManagerService,
    private readonly dataSource: DataSource,
    private readonly printerEventUtils: PrinterEventUtils,
  ) {}

  async onModuleInit() {
    const context = `${PrinterLegacyWorker.name}.${this.onModuleInit.name}`;
    this.logger.log(`Initializing printer legacy worker`, context);
    const client = await this.printerQueue.client;
    this.redlock = new Redlock([client]);
    this.logger.log(`Printer legacy worker initialized`, context);
  }

  async getTtlLockLabelTicketPrinter() {
    const ttl = await this.systemConfigService.get(
      SystemConfigKey.TTL_LOCK_LABEL_TICKET_PRINTER,
    );
    return ttl ? parseInt(ttl) : 40000;
  }

  async getDelayPrintLabelTicketPrinter() {
    const delay = await this.systemConfigService.get(
      SystemConfigKey.DELAY_PRINT_LABEL_TICKET_PRINTER,
    );
    return delay ? parseInt(delay) : 5000;
  }

  async getTtlLockChefOrderPrinter() {
    const ttl = await this.systemConfigService.get(
      SystemConfigKey.TTL_LOCK_CHEF_ORDER_PRINTER,
    );
    return ttl ? parseInt(ttl) : 30000;
  }

  async getDelayPrintChefOrderPrinter() {
    const delay = await this.systemConfigService.get(
      SystemConfigKey.DELAY_PRINT_CHEF_ORDER_PRINTER,
    );
    return delay ? parseInt(delay) : 2000;
  }

  async getTtlLockInvoicePrinter() {
    const ttl = await this.systemConfigService.get(
      SystemConfigKey.TTL_LOCK_INVOICE_PRINTER,
    );
    return ttl ? parseInt(ttl) : 30000;
  }

  async getDelayPrintInvoicePrinter() {
    const delay = await this.systemConfigService.get(
      SystemConfigKey.DELAY_PRINT_INVOICE_PRINTER,
    );
    return delay ? parseInt(delay) : 2000;
  }

  @Cron('*/2 * * * * *')
  async handlePrintJob() {
    const context = `${PrinterLegacyWorker.name}.${this.handlePrintJob.name}`;

    // Guard: only run when PRINTER_SYSTEM = 'LEGACY'
    const mode = await this.systemConfigService.get(
      SystemConfigKey.PRINTER_SYSTEM,
      false,
    );
    if (mode !== 'LEGACY') return;

    let printerJob: any;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.query(
      'SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED',
    );
    await queryRunner.startTransaction();

    try {
      const jobs: PrinterJobQueryResponseDto[] =
        await queryRunner.manager.query(
          `SELECT
              id_column AS id,
              slug_column AS slug,
              printer_ip_column AS printerIp,
              printer_port_column AS printerPort,
              job_type_column AS jobType,
              status_column AS status,
              data_column AS data,
              error_column AS error,
              created_at_column AS createdAt,
              updated_at_column AS updatedAt
            FROM terminal_db.printer_job_tbl
            WHERE status_column = 'pending'
            ORDER BY created_at_column ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED`,
        );

      if (_.isEmpty(jobs)) {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
        return;
      }

      printerJob = _.first(jobs);

      await queryRunner.manager.update(
        'terminal_db.printer_job_tbl',
        { id_column: printerJob.id },
        { status_column: PrinterJobStatus.PRINTING },
      );

      await queryRunner.commitTransaction();
      await queryRunner.release();
      this.logger.log(
        'queryRunner to get pending printer job released',
        context,
      );
    } catch (error) {
      this.logger.error(
        `Unhandled error in handlePrintJob`,
        error.stack,
        context,
      );
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
      return;
    }

    this.logger.log(`Handling print job`, context);

    if (printerJob.jobType === PrinterJobType.LABEL_TICKET) {
      this.logger.log('Printing label ticket', context);
      const chefOrderLabel = await this.chefOrderRepository.findOne({
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
      if (!chefOrderLabel) {
        this.logger.error(`Chef order not found`, context);
        return;
      }
      let lockLabelTicket: any = null;
      try {
        const labelTicketKey = `printer-job:${printerJob.printerIp}:${printerJob.printerPort}`;
        const ttl = await this.getTtlLockLabelTicketPrinter();
        const resource = [labelTicketKey];
        const lockStartTime = Date.now();
        lockLabelTicket = await this.redlock.acquire(resource, ttl);
        this.logger.log(
          `Lock success for label ticket printer ${printerJob.printerIp}:${printerJob.printerPort}`,
          context,
        );
        const bitmapDataList: Buffer[] = [];
        for (const chefOrderItem of chefOrderLabel.chefOrderItems) {
          let data = await this.pdfService.generatePdfImage(
            'chef-order-item-ticket-image',
            {
              productName:
                chefOrderItem?.orderItem?.variant?.product?.name ?? 'N/A',
              referenceNumber: `${chefOrderLabel?.order?.slug ?? 'N/A'} ${moment(chefOrderLabel?.order?.createdAt).format('DD/MM/YYYY HH:mm')}`,
              note: chefOrderItem?.orderItem?.note ?? 'N/A',
              variantName:
                chefOrderItem?.orderItem?.variant?.size?.name ?? 'N/A',
              createdAt: chefOrderLabel?.order?.createdAt ?? 'N/A',
            },
            { type: 'png', omitBackground: false },
          );
          const bitmapData = await this.convertImageToBitmap(data);
          data = null;
          for (let i = 0; i < chefOrderItem.quantity; i++) {
            bitmapDataList.push(bitmapData);
          }
        }
        const maxRetries = 3;
        let attempt = 1;
        const delay = await this.getDelayPrintLabelTicketPrinter();
        while (attempt <= maxRetries) {
          try {
            if (Date.now() - lockStartTime > ttl) {
              this.logger.warn(
                `Lock expired for label ticket printer ${printerJob.printerIp}:${printerJob.printerPort}`,
                context,
              );
              await this.printerJobRepository.update(printerJob.id, {
                status: PrinterJobStatus.FAILED,
                error: 'Lock expired',
              });
              await this.printerEventUtils.sendPrinterEventForAllBranchStaffsWhenFailedLabelTicketPrinting(
                chefOrderLabel.slug,
                chefOrderLabel.order,
                printerJob.id,
              );
              break;
            }
            this.logger.log(
              `Attempt ${attempt} to print label ticket of chef order ${printerJob.data}`,
              context,
            );
            await this.printerUtils.handlePrintChefOrderItemTicket(
              printerJob.printerIp,
              printerJob.printerPort,
              bitmapDataList,
            );
            await this.transactionManagerService.execute(
              async (manager) => {
                await this.printerEventUtils.updatePrinterEventRetryStatusToSuccess(
                  printerJob.id,
                  manager,
                );
                await manager.update(
                  'terminal_db.printer_job_tbl',
                  { id_column: printerJob.id },
                  { status_column: PrinterJobStatus.PRINTED },
                );
              },
              async () => {
                this.logger.log(
                  `Printer job ${printerJob.id} updated`,
                  context,
                );
                if (lockLabelTicket) {
                  try {
                    await lockLabelTicket.release();
                    this.logger.log(
                      `Lock released when print job success`,
                      context,
                    );
                  } catch (err) {
                    this.logger.error(
                      `Error releasing lock when print job success`,
                      err.stack,
                      context,
                    );
                  }
                }
              },
              (err) => {
                this.logger.error(
                  `Error updating printer job`,
                  err.stack,
                  context,
                );
              },
            );
            break;
          } catch (error) {
            this.logger.error(`Error handling print job`, error.stack, context);
            if (attempt === maxRetries) {
              await this.printerJobRepository.update(printerJob.id, {
                status: PrinterJobStatus.FAILED,
                error: error.message,
              });
              await this.printerEventUtils.sendPrinterEventForAllBranchStaffsWhenFailedLabelTicketPrinting(
                chefOrderLabel.slug,
                chefOrderLabel.order,
                printerJob.id,
              );
              break;
            }
            attempt++;
            if (Date.now() - lockStartTime > ttl) {
              this.logger.warn(
                `Lock expired for label ticket printer ${printerJob.printerIp}:${printerJob.printerPort}`,
                context,
              );
              await this.printerJobRepository.update(printerJob.id, {
                status: PrinterJobStatus.FAILED,
                error: 'Lock expired',
              });
              await this.printerEventUtils.sendPrinterEventForAllBranchStaffsWhenFailedLabelTicketPrinting(
                chefOrderLabel.slug,
                chefOrderLabel.order,
                printerJob.id,
              );
              break;
            }
            if (attempt <= maxRetries) {
              this.logger.log(`Waiting for next attempt`, context);
              await new Promise((resolve) =>
                setTimeout(resolve, delay * attempt),
              );
            }
            if (Date.now() - lockStartTime > ttl) {
              this.logger.warn(
                `Lock expired for label ticket printer ${printerJob.printerIp}:${printerJob.printerPort}`,
                context,
              );
              await this.printerJobRepository.update(printerJob.id, {
                status: PrinterJobStatus.FAILED,
                error: 'Lock expired',
              });
              await this.printerEventUtils.sendPrinterEventForAllBranchStaffsWhenFailedLabelTicketPrinting(
                chefOrderLabel.slug,
                chefOrderLabel.order,
                printerJob.id,
              );
              break;
            }
          }
        }
        if (lockLabelTicket) {
          try {
            await lockLabelTicket.release();
            this.logger.warn(
              `Lock released when exceed max retries for printer job ${printerJob.printerIp}:${printerJob.printerPort}`,
              context,
            );
          } catch (err) {
            this.logger.error(
              `Error releasing lock when exceed max retries`,
              err.stack,
              context,
            );
          }
        }
      } catch (error) {
        this.logger.error(
          `Error acquiring lock for print label ticket`,
          error.stack,
          context,
        );
        await this.printerJobRepository.update(printerJob.id, {
          status: PrinterJobStatus.PENDING,
        });
      }
    } else if (printerJob.jobType === PrinterJobType.CHEF_ORDER) {
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
        this.logger.error(`Chef order not found`, context);
        return;
      }
      let lockChefOrder: any = null;
      try {
        const chefOrderKey = `printer-job:${printerJob.printerIp}:${printerJob.printerPort}`;
        const ttl = await this.getTtlLockChefOrderPrinter();
        const resource = [chefOrderKey];
        const lockStartTime = Date.now();
        lockChefOrder = await this.redlock.acquire(resource, ttl);
        this.logger.log(
          `Lock success for chef order printer ${printerJob.printerIp}:${printerJob.printerPort}`,
          context,
        );
        const maxRetries = 3;
        let attempt = 1;
        const delay = await this.getDelayPrintChefOrderPrinter();
        while (attempt <= maxRetries) {
          try {
            if (Date.now() - lockStartTime > ttl) {
              this.logger.warn(
                `Lock expired for chef order printer ${printerJob.printerIp}:${printerJob.printerPort}`,
                context,
              );
              await this.printerJobRepository.update(printerJob.id, {
                status: PrinterJobStatus.FAILED,
                error: 'Lock expired',
              });
              await this.printerEventUtils.sendPrinterEventForAllBranchStaffsWhenFailedChefOrderPrinting(
                chefOrder.slug,
                chefOrder.order,
                printerJob.id,
              );
              break;
            }
            this.logger.log(
              `Attempt ${attempt} to print chef order ${printerJob.data}`,
              context,
            );
            await this.printerUtils.handlePrintChefOrder(
              printerJob.printerIp,
              printerJob.printerPort,
              chefOrder,
            );
            await this.transactionManagerService.execute(
              async (manager) => {
                await this.printerEventUtils.updatePrinterEventRetryStatusToSuccess(
                  printerJob.id,
                  manager,
                );
                await manager.update(
                  'terminal_db.printer_job_tbl',
                  { id_column: printerJob.id },
                  { status_column: PrinterJobStatus.PRINTED },
                );
              },
              async () => {
                this.logger.log(
                  `Printer job ${printerJob.id} updated`,
                  context,
                );
                if (lockChefOrder) {
                  try {
                    await lockChefOrder.release();
                    this.logger.log(
                      `Lock released when print job success`,
                      context,
                    );
                  } catch (err) {
                    this.logger.error(
                      `Error releasing lock when print job success`,
                      err.stack,
                      context,
                    );
                  }
                }
              },
              (err) => {
                this.logger.error(
                  `Error updating printer job`,
                  err.stack,
                  context,
                );
              },
            );
            break;
          } catch (error) {
            this.logger.error(`Error handling print job`, error.stack, context);
            if (attempt === maxRetries) {
              await this.printerJobRepository.update(printerJob.id, {
                status: PrinterJobStatus.FAILED,
                error: error.message,
              });
              await this.printerEventUtils.sendPrinterEventForAllBranchStaffsWhenFailedChefOrderPrinting(
                chefOrder.slug,
                chefOrder.order,
                printerJob.id,
              );
              break;
            }
            attempt++;
            if (Date.now() - lockStartTime > ttl) {
              this.logger.warn(
                `Lock expired for chef order printer ${printerJob.printerIp}:${printerJob.printerPort}`,
                context,
              );
              await this.printerJobRepository.update(printerJob.id, {
                status: PrinterJobStatus.FAILED,
                error: 'Lock expired',
              });
              await this.printerEventUtils.sendPrinterEventForAllBranchStaffsWhenFailedChefOrderPrinting(
                chefOrder.slug,
                chefOrder.order,
                printerJob.id,
              );
              break;
            }
            if (attempt <= maxRetries) {
              this.logger.log(`Waiting for next attempt`, context);
              await new Promise((resolve) =>
                setTimeout(resolve, delay * attempt),
              );
            }
            if (Date.now() - lockStartTime > ttl) {
              this.logger.warn(
                `Lock expired for chef order printer ${printerJob.printerIp}:${printerJob.printerPort}`,
                context,
              );
              await this.printerJobRepository.update(printerJob.id, {
                status: PrinterJobStatus.FAILED,
                error: 'Lock expired',
              });
              await this.printerEventUtils.sendPrinterEventForAllBranchStaffsWhenFailedChefOrderPrinting(
                chefOrder.slug,
                chefOrder.order,
                printerJob.id,
              );
              break;
            }
          }
        }
        if (lockChefOrder) {
          try {
            await lockChefOrder.release();
            this.logger.warn(
              `Lock released when exceed max retries for printer job ${printerJob.printerIp}:${printerJob.printerPort}`,
              context,
            );
          } catch (err) {
            this.logger.error(
              `Error releasing lock when exceed max retries`,
              err.stack,
              context,
            );
          }
        }
      } catch (error) {
        this.logger.error(
          `Error acquiring lock for print chef order`,
          error.stack,
          context,
        );
        await this.printerJobRepository.update(printerJob.id, {
          status: PrinterJobStatus.PENDING,
        });
      }
    } else if (printerJob.jobType === PrinterJobType.INVOICE) {
      const order = await this.orderRepository.findOne({
        where: { id: printerJob.data },
        relations: { branch: true },
      });
      if (!order) {
        this.logger.error(
          `Order not found when print invoice in legacy worker`,
          context,
        );
        return;
      }
      let lockInvoice: any = null;
      try {
        const invoiceKey = `printer-job:${printerJob.printerIp}:${printerJob.printerPort}`;
        const ttl = await this.getTtlLockInvoicePrinter();
        const resource = [invoiceKey];
        const lockStartTime = Date.now();
        lockInvoice = await this.redlock.acquire(resource, ttl);
        this.logger.log(
          `Lock success for invoice printer ${printerJob.printerIp}:${printerJob.printerPort}`,
          context,
        );
        const maxRetries = 3;
        let attempt = 1;
        const delay = await this.getDelayPrintInvoicePrinter();
        while (attempt <= maxRetries) {
          try {
            if (Date.now() - lockStartTime > ttl) {
              this.logger.warn(
                `Lock expired for invoice printer ${printerJob.printerIp}:${printerJob.printerPort}`,
                context,
              );
              await this.printerJobRepository.update(printerJob.id, {
                status: PrinterJobStatus.FAILED,
                error: 'Lock expired',
              });
              await this.printerEventUtils.sendPrinterEventForAllBranchStaffsWhenFailedBillPrinting(
                order,
                printerJob.id,
              );
              break;
            }
            this.logger.log(
              `Attempt ${attempt} to print invoice ${printerJob.data}`,
              context,
            );
            await this.printerUtils.handlePrintInvoice(
              printerJob.printerIp,
              printerJob.printerPort,
              order.slug,
            );
            await this.transactionManagerService.execute(
              async (manager) => {
                await this.printerEventUtils.updatePrinterEventRetryStatusToSuccess(
                  printerJob.id,
                  manager,
                );
                await manager.update(
                  'terminal_db.printer_job_tbl',
                  { id_column: printerJob.id },
                  { status_column: PrinterJobStatus.PRINTED },
                );
              },
              async () => {
                this.logger.log(
                  `Printer job ${printerJob.id} updated`,
                  context,
                );
                if (lockInvoice) {
                  try {
                    await lockInvoice.release();
                    this.logger.log(
                      `Lock released when print job success`,
                      context,
                    );
                  } catch (err) {
                    this.logger.error(
                      `Error releasing lock when print job success`,
                      err.stack,
                      context,
                    );
                  }
                }
              },
              (err) => {
                this.logger.error(
                  `Error updating printer job`,
                  err.stack,
                  context,
                );
              },
            );
            break;
          } catch (error) {
            this.logger.error(`Error handling print job`, error.stack, context);
            if (attempt === maxRetries) {
              await this.printerJobRepository.update(printerJob.id, {
                status: PrinterJobStatus.FAILED,
                error: error.message,
              });
              await this.printerEventUtils.sendPrinterEventForAllBranchStaffsWhenFailedBillPrinting(
                order,
                printerJob.id,
              );
              break;
            }
            attempt++;
            if (Date.now() - lockStartTime > ttl) {
              this.logger.warn(
                `Lock expired for invoice printer ${printerJob.printerIp}:${printerJob.printerPort}`,
                context,
              );
              await this.printerJobRepository.update(printerJob.id, {
                status: PrinterJobStatus.FAILED,
                error: 'Lock expired',
              });
              await this.printerEventUtils.sendPrinterEventForAllBranchStaffsWhenFailedBillPrinting(
                order,
                printerJob.id,
              );
              break;
            }
            if (attempt <= maxRetries) {
              this.logger.log(`Waiting for next attempt`, context);
              await new Promise((resolve) =>
                setTimeout(resolve, delay * attempt),
              );
            }
            if (Date.now() - lockStartTime > ttl) {
              this.logger.warn(
                `Lock expired for invoice printer ${printerJob.printerIp}:${printerJob.printerPort}`,
                context,
              );
              await this.printerJobRepository.update(printerJob.id, {
                status: PrinterJobStatus.FAILED,
                error: 'Lock expired',
              });
              await this.printerEventUtils.sendPrinterEventForAllBranchStaffsWhenFailedBillPrinting(
                order,
                printerJob.id,
              );
              break;
            }
          }
        }
        if (lockInvoice) {
          try {
            await lockInvoice.release();
            this.logger.warn(
              `Lock released when exceed max retries for printer job ${printerJob.printerIp}:${printerJob.printerPort}`,
              context,
            );
          } catch (err) {
            this.logger.error(
              `Error releasing lock when exceed max retries`,
              err.stack,
              context,
            );
          }
        }
      } catch (error) {
        this.logger.error(
          `Error acquiring lock for print invoice`,
          error.stack,
          context,
        );
        await this.printerJobRepository.update(printerJob.id, {
          status: PrinterJobStatus.PENDING,
        });
      }
    } else {
      this.logger.error(`Unknown job type ${printerJob.jobType}`, context);
    }
  }

  async convertImageToBitmap(imageBuffer: Buffer): Promise<Buffer> {
    const width = 576;
    const height = 384;
    const data = await sharp(imageBuffer)
      .resize(width, height)
      .grayscale()
      .negate()
      .threshold(128)
      .raw()
      .toBuffer();

    const bytesPerRow = Math.ceil(width / 8);
    const bitmapData = Buffer.alloc(bytesPerRow * height);

    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) {
        const pixelIndex = i * width + j;
        const pixel = data[pixelIndex];
        if (pixel === 0) {
          bitmapData[i * bytesPerRow + (j >> 3)] |= 0x80 >> j % 8;
        }
      }
    }

    return bitmapData;
  }
}
