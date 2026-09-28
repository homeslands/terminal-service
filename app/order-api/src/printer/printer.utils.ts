import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ChefOrderItem } from 'src/chef-order-item/chef-order-item.entity';
import {
  PrinterJobStatus,
  PrinterJobType,
  PrinterType,
} from './printer.constants';
import { ChefOrder } from 'src/chef-order/chef-order.entity';
import { createCanvas } from 'canvas';
import { PrinterProducer } from './printer.producer';
import moment from 'moment';
import { PrinterManager } from './printer.manager';
import { PrinterJob } from './entity/printer-job.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PrinterException } from './printer.exception';
import PrinterValidation from './printer.validation';
import { ExportInvoiceDto } from 'src/invoice/invoice.dto';
import { InvoiceService } from 'src/invoice/invoice.service';
import { PdfService } from 'src/pdf/pdf.service';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import sharp from 'sharp';
import { SystemConfigService } from 'src/system-config/system-config.service';
import { SystemConfigKey } from 'src/system-config/system-config.constant';
import { Payment } from 'src/payment/entity/payment.entity';

@Injectable()
export class PrinterUtils {
  constructor(
    private readonly printerManager: PrinterManager,
    private readonly printerProducer: PrinterProducer,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    @InjectRepository(PrinterJob)
    private readonly printerJobRepository: Repository<PrinterJob>,
    @InjectRepository(ChefOrder)
    private readonly chefOrderRepository: Repository<ChefOrder>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @Inject(forwardRef(() => InvoiceService))
    private readonly invoiceService: InvoiceService,
    private readonly pdfService: PdfService,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  async printChefOrderItemTicket(
    printerIp: string,
    printerPort: string,
    bitmapDataList: Buffer[],
  ) {
    this.printerProducer.createPrintJob({
      jobType: PrinterJobType.LABEL_TICKET,
      printerIp,
      printerPort,
      bitmapDataList,
    });
  }

  async handlePrintChefOrderItemTicket(
    printerIp: string,
    printerPort: string,
    bitmapDataList: Buffer[],
  ) {
    const context = `${PrinterUtils.name}.${this.handlePrintChefOrderItemTicket.name}`;

    const buffersToSend = this.createTsplChefOrderItemTicket(bitmapDataList);

    try {
      const socket = this.printerManager.getOrCreateConnection(
        printerIp,
        printerPort,
        PrinterType.RAW,
      );

      for (const buffer of buffersToSend) {
        await socket.send(buffer);
      }
    } catch (error) {
      this.logger.error(`Error printing ticket`, error.stack, context);
      throw new PrinterException(PrinterValidation.ERROR_PRINTING_TICKET);
    } finally {
      this.logger.log(
        `Sent ${buffersToSend.length} buffers for ${bitmapDataList.length} labels`,
        context,
      );
    }
  }

  createTsplChefOrderItemTicket(bitmapDataList: Buffer[]): Buffer[] {
    const buffers: Buffer[] = [];

    for (const bitmap of bitmapDataList) {
      const header = Buffer.from(
        `SIZE 50 mm,30 mm\nGAP 2 mm,0 mm\nCLS\n`,
        'ascii',
      );
      const bitmapCmd = Buffer.from(`BITMAP 0,0,72,384,0,\n`, 'ascii');
      const printCmd = Buffer.from(`\nPRINT 1,1\n`, 'ascii');

      buffers.push(Buffer.concat([header, bitmapCmd, bitmap, printCmd]));
    }

    return buffers;
  }

  async printChefOrder(
    printerIp: string,
    printerPort: string,
    chefOrder: ChefOrder,
  ) {
    this.printerProducer.createPrintJob({
      jobType: PrinterJobType.CHEF_ORDER,
      printerIp,
      printerPort,
      chefOrder,
    });
  }

  async handlePrintChefOrder(
    printerIp: string,
    printerPort: string,
    chefOrder: ChefOrder,
  ) {
    const context = `${PrinterUtils.name}.${this.handlePrintChefOrder.name}`;
    const buffersToSend = await this.createChefOrderEscPosBufferByCanvas(
      chefOrder.order?.slug ?? 'N/A',
      chefOrder.order?.branch?.name ?? 'N/A',
      chefOrder.order?.table?.name ?? 'N/A',
      moment(chefOrder.order?.createdAt).format('DD/MM/YYYY HH:mm:ss'),
      chefOrder.order?.description ?? 'N/A',
      chefOrder.chefOrderItems,
      chefOrder.order?.timeLeftTakeOut ?? 0,
      chefOrder.order?.deliveryPhone ?? 'N/A',
      chefOrder.order?.deliveryTo?.formattedAddress ?? 'N/A',
      chefOrder.order?.type ?? 'N/A',
    );

    try {
      const socket = this.printerManager.getOrCreateConnection(
        printerIp,
        printerPort,
        PrinterType.ESC_POS,
      );

      await socket.send(buffersToSend);
    } catch (error) {
      this.logger.error(`Error printing chef order`, error.stack, context);
      throw new PrinterException(PrinterValidation.ERROR_PRINTING_CHEF_ORDER);
    } finally {
      this.logger.log(
        `Sent ${buffersToSend.length} chef order buffer for printer ${printerIp}:${printerPort}`,
        context,
      );
    }
  }

  async createChefOrderEscPosBufferByCanvas(
    orderCode: string,
    branchName: string,
    table: string,
    createdAt: string,
    noteAll: string,
    chefOrderItems: ChefOrderItem[],
    timeLeftTakeOut: number,
    deliveryPhone: string,
    deliveryTo: string,
    type: string,
  ): Promise<Buffer> {
    const canvasWidth = 576;
    const lineHeight = 36;
    const padding = 20;

    // Prepare temp context to calculate text wrapping
    const tempCanvas = createCanvas(1, 1);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.font = '24px Roboto';

    const headerWidths = [0.4, 0.2, 0.1, 0.3];
    const canvasWidthEstimated = 576;

    // Estimate wrapped lines for product rows
    const totalWrappedLines = chefOrderItems.reduce((sum, item) => {
      const values = [
        item.orderItem.variant.product.name,
        item.orderItem.variant.size.name.toUpperCase(),
        item.quantity.toString(),
        item.orderItem.note || '',
      ];

      const wrapped = values.map((v, i) => {
        const colWidth = headerWidths[i] * canvasWidthEstimated;
        return this.wrapText(tempCtx, v, colWidth - 10).length;
      });

      return sum + Math.max(...wrapped);
    }, 0);

    // Estimate lines for header info (branchName, createdAt, table, noteAll)
    const infoFields = [branchName, createdAt];

    if (type === 'take-out') {
      infoFields.push(type.toString());
      infoFields.push(timeLeftTakeOut.toString());
    }

    if (type === 'delivery') {
      infoFields.push(type.toString());
      infoFields.push(deliveryTo);
      infoFields.push(deliveryPhone);
    }

    if (type === 'at-table') {
      infoFields.push(type.toString());
      infoFields.push(table);
    }

    infoFields.push(noteAll || 'Không có ghi chú');

    const infoWrappedLines = infoFields.reduce((sum, field) => {
      return (
        sum + this.wrapText(tempCtx, field, canvasWidth - 2 * padding).length
      );
    }, 0);

    const fixedHeaderHeight = 180 + infoWrappedLines * lineHeight; // base + wrapped info lines
    const canvasHeight =
      fixedHeaderHeight + totalWrappedLines * lineHeight + 100;

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 30px Roboto';
    ctx.textAlign = 'center';
    ctx.fillText('TREND COFFEE', canvasWidth / 2, 40);
    ctx.font = '24px Roboto';
    ctx.fillText(`Mã đơn: ${orderCode}`, canvasWidth / 2, 80);

    // Info section (Chi nhánh, Thời gian, Bàn, Thời gian mang đi, Ghi chú)
    ctx.textAlign = 'left';
    let currentY = 120;
    const infoData = [`Chi nhánh: ${branchName}`, `Thời gian: ${createdAt}`];

    if (type === 'take-out') {
      infoData.push(`Hình thức: Mang đi`);
      infoData.push(`Thời gian mang đi: ${timeLeftTakeOut} (phút)`);
    }

    if (type === 'delivery') {
      infoData.push(`Hình thức: Giao hàng`);
      infoData.push(`Giao hàng tới: ${deliveryTo}`);
      infoData.push(`SĐT: ${deliveryPhone}`);
    }

    if (type === 'at-table') {
      infoData.push(`Hình thức: Tại bàn`);
      infoData.push(`Bàn: ${table}`);
    }

    infoData.push(`Ghi chú: ${noteAll || 'Không có ghi chú'}`);

    infoData.forEach((text) => {
      const lines = this.wrapText(ctx, text, canvasWidth - 2 * padding);
      lines.forEach((line) => {
        ctx.fillText(line, padding, currentY);
        currentY += lineHeight;
      });
    });

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(padding, currentY);
    ctx.lineTo(canvasWidth - padding, currentY);
    ctx.stroke();
    currentY += 30;

    // Table headers
    const headers = ['Món', 'Size', 'SL', 'Ghi chú'];
    const headerX = headerWidths.map(
      (_, i) =>
        headerWidths.slice(0, i).reduce((sum, w) => sum + w, 0) * canvasWidth,
    );

    ctx.font = 'bold 24px Roboto';
    headers.forEach((h, i) => {
      ctx.fillText(h, headerX[i] + 5, currentY);
    });
    currentY += lineHeight;

    // Product lines
    ctx.font = '24px Roboto';

    chefOrderItems.forEach((item) => {
      const values = [
        item.orderItem.variant.product.name,
        item.orderItem.variant.size.name.toUpperCase(),
        item.quantity.toString(),
        item.orderItem.note || '',
      ];

      const wrappedLines = values.map((v, i) => {
        const colWidth = headerWidths[i] * canvasWidth;
        return this.wrapText(ctx, v, colWidth - 10);
      });

      const maxLines = Math.max(...wrappedLines.map((lines) => lines.length));

      for (let line = 0; line < maxLines; line++) {
        wrappedLines.forEach((lines, i) => {
          const text = lines[line] || '';
          ctx.fillText(text, headerX[i] + 5, currentY);
        });
        currentY += lineHeight;
      }
    });

    return canvas.toBuffer('image/png');
  }

  wrapText(ctx: any, text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = ctx.measureText(testLine).width;
      if (width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  async createPrintJob(
    jobType: PrinterJobType,
    data: string,
    printerIp: string,
    printerPort: string,
  ) {
    const context = `${PrinterUtils.name}.${this.createPrintJob.name}`;
    this.logger.log(`Creating print job for ${jobType}`, context);
    const printerJob = new PrinterJob();
    printerJob.jobType = jobType;
    printerJob.data = data;
    printerJob.printerIp = printerIp;
    printerJob.printerPort = printerPort;
    printerJob.status = PrinterJobStatus.PENDING;
    await this.printerJobRepository.save(printerJob);
    this.logger.log(`Print job created`, context);

    // Enqueue to BullMQ only in CONNECTOR mode (default).
    // In LEGACY mode the cron worker polls the DB directly.
    const isLegacy =
      (await this.systemConfigService.get(
        SystemConfigKey.PRINTER_SYSTEM,
        false,
      )) === 'LEGACY';
    if (!isLegacy) {
      await this.printerProducer.enqueuePrinterJob(printerJob.id);
      this.logger.log(`Print job ${printerJob.id} enqueued`, context);
    } else {
      this.logger.log(
        `Print job ${printerJob.id} saved (LEGACY mode, cron will pick up)`,
        context,
      );
    }
  }

  /**
   * Convert a PNG image buffer to ESC/POS raster bytes suitable for
   * `raw_passthrough` print jobs. Equivalent to the Python reference
   * `build_png_receipt` helper in prompt/test_escpos_raster_bill.py.
   *
   * @param paperWidthMm paper width in mm (80 for receipt, 50 for label)
   * @param threshold 0-255; pixels darker than this become black
   * @param feedLines number of blank lines to feed after the image
   * @param cutAfter whether to issue a GS V 1 partial-cut command
   */
  private async pngToEscPosRasterBase64(
    pngBuffer: Buffer,
    paperWidthMm = 80,
    threshold = 180,
    feedLines = 4,
    cutAfter = true,
  ): Promise<string> {
    // 8 dots per mm; align width to a multiple of 8
    const targetWidth = Math.floor((paperWidthMm * 8) / 8) * 8;

    const { data, info } = await sharp(pngBuffer)
      .resize({ width: targetWidth, fit: 'contain', background: '#ffffff' })
      .flatten({ background: '#ffffff' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const widthDots = info.width;
    const heightDots = info.height;
    const bytesPerRow = Math.ceil(widthDots / 8);

    // Pack grayscale → 1-bit (MSB first), black = 1
    const bitmap = Buffer.alloc(bytesPerRow * heightDots, 0);
    for (let y = 0; y < heightDots; y++) {
      for (let x = 0; x < widthDots; x++) {
        const lum = data[y * widthDots + x];
        if (lum < threshold) {
          const byteIdx = y * bytesPerRow + (x >> 3);
          bitmap[byteIdx] |= 0x80 >> (x & 7);
        }
      }
    }

    // ESC/POS commands
    const init = Buffer.from([0x1b, 0x40]); // ESC @
    // GS v 0 m xL xH yL yH
    const header = Buffer.from([
      0x1d,
      0x76,
      0x30,
      0x00,
      bytesPerRow & 0xff,
      (bytesPerRow >> 8) & 0xff,
      heightDots & 0xff,
      (heightDots >> 8) & 0xff,
    ]);
    // ESC d n (feed n lines)
    const feed = Buffer.from([0x1b, 0x64, Math.max(0, feedLines) & 0xff]);
    // GS V 1 (partial cut)
    const cut = cutAfter ? Buffer.from([0x1d, 0x56, 0x01]) : Buffer.alloc(0);

    const raster = Buffer.concat([init, header, bitmap, feed, cut]);
    return raster.toString('base64');
  }

  async createChefOrderPngBuffer(chefOrderId: string): Promise<Buffer> {
    const chefOrder = await this.chefOrderRepository.findOne({
      where: { id: chefOrderId },
      relations: [
        'chefArea',
        'order.branch',
        'order.table',
        'order.deliveryTo',
        'chefOrderItems.orderItem.variant.size',
        'chefOrderItems.orderItem.variant.product',
      ],
    });
    if (!chefOrder) {
      throw new PrinterException(PrinterValidation.ERROR_PRINTING_CHEF_ORDER);
    }

    const logoPath = resolve('public/images/logo.png');
    const logoString = (
      await sharp(readFileSync(logoPath))
        .flatten({ background: '#ffffff' })
        .trim({ background: '#ffffff', threshold: 10 })
        .toBuffer()
    ).toString('base64');

    const pngBuffer = await this.pdfService.generatePngFromTemplate(
      'chef-order',
      {
        ...chefOrder,
        logoString,
        branchAddress: chefOrder.order?.branch?.address ?? '',
        referenceNumber: chefOrder.order?.slug ?? '',
        tableName: chefOrder.order?.table?.name ?? 'Take out',
        areaName: chefOrder.chefArea?.name ?? '',
        description: chefOrder.order?.description ?? '',
        timeLeftTakeOut: chefOrder.order?.timeLeftTakeOut ?? 0,
        deliveryPhone: chefOrder.order?.deliveryPhone ?? '',
        deliveryTo: chefOrder.order?.deliveryTo?.formattedAddress ?? '',
        type: chefOrder.order?.type ?? '',
      },
      { width: 384, height: 100, deviceScaleFactor: 1.5 },
    );

    const { data: rawData, info: rawInfo } = await sharp(pngBuffer)
      .flatten({ background: '#ffffff' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let firstContentRow = 0;
    outer: for (let y = 0; y < rawInfo.height; y++) {
      for (let x = 0; x < rawInfo.width; x++) {
        const offset = (y * rawInfo.width + x) * rawInfo.channels;
        if (
          rawData[offset] < 240 ||
          rawData[offset + 1] < 240 ||
          rawData[offset + 2] < 240
        ) {
          firstContentRow = y;
          break outer;
        }
      }
    }

    return sharp(pngBuffer)
      .extract({
        left: 0,
        top: firstContentRow,
        width: rawInfo.width,
        height: rawInfo.height - firstContentRow,
      })
      .toBuffer();
  }

  async createChefOrderEscPosBase64(chefOrderId: string): Promise<string> {
    const context = `${PrinterUtils.name}.${this.createChefOrderEscPosBase64.name}`;
    const trimmedBuffer = await this.createChefOrderPngBuffer(chefOrderId);
    const rasterBase64 = await this.pngToEscPosRasterBase64(trimmedBuffer, 72);
    this.logger.log(
      `Built chef order raster for ${chefOrderId}: trimmed=${trimmedBuffer.length}B, base64=${rasterBase64.length} chars`,
      context,
    );
    return rasterBase64;
  }

  async createInvoicePngBuffer(orderSlug: string): Promise<Buffer> {
    const pngBuffer = await this.invoiceService.exportBufferPng({
      order: orderSlug,
    } as ExportInvoiceDto);

    const { data: rawData, info: rawInfo } = await sharp(pngBuffer)
      .flatten({ background: '#ffffff' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let firstContentRow = 0;
    outer: for (let y = 0; y < rawInfo.height; y++) {
      for (let x = 0; x < rawInfo.width; x++) {
        const offset = (y * rawInfo.width + x) * rawInfo.channels;
        if (
          rawData[offset] < 240 ||
          rawData[offset + 1] < 240 ||
          rawData[offset + 2] < 240
        ) {
          firstContentRow = y;
          break outer;
        }
      }
    }

    return sharp(pngBuffer)
      .extract({
        left: 0,
        top: firstContentRow,
        width: rawInfo.width,
        height: rawInfo.height - firstContentRow,
      })
      .toBuffer();
  }

  async createInvoiceEscPosBase64(orderSlug: string): Promise<string> {
    const context = `${PrinterUtils.name}.${this.createInvoiceEscPosBase64.name}`;
    const trimmedBuffer = await this.createInvoicePngBuffer(orderSlug);
    const rasterBase64 = await this.pngToEscPosRasterBase64(trimmedBuffer, 72);
    this.logger.log(
      `Built invoice raster for ${orderSlug}: trimmed=${trimmedBuffer.length}B, base64=${rasterBase64.length} chars`,
      context,
    );
    return rasterBase64;
  }

  async createTemporaryInvoiceEscPosBase64(orderSlug: string): Promise<string> {
    const context = `${PrinterUtils.name}.${this.createTemporaryInvoiceEscPosBase64.name}`;
    const pngBuffer =
      await this.invoiceService.exportTemporaryInvoiceBufferPng(orderSlug);

    const { data: rawData, info: rawInfo } = await sharp(pngBuffer)
      .flatten({ background: '#ffffff' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let firstContentRow = 0;
    outer: for (let y = 0; y < rawInfo.height; y++) {
      for (let x = 0; x < rawInfo.width; x++) {
        const offset = (y * rawInfo.width + x) * rawInfo.channels;
        if (
          rawData[offset] < 240 ||
          rawData[offset + 1] < 240 ||
          rawData[offset + 2] < 240
        ) {
          firstContentRow = y;
          break outer;
        }
      }
    }

    const trimmedBuffer = await sharp(pngBuffer)
      .extract({
        left: 0,
        top: firstContentRow,
        width: rawInfo.width,
        height: rawInfo.height - firstContentRow,
      })
      .toBuffer();

    const rasterBase64 = await this.pngToEscPosRasterBase64(trimmedBuffer, 72);
    this.logger.log(
      `Built temp invoice raster for ${orderSlug}: png=${pngBuffer.length}B trimmed=${trimmedBuffer.length}B, base64=${rasterBase64.length} chars`,
      context,
    );
    return rasterBase64;
  }

  async createPaymentEscPosBase64(slug: string): Promise<string> {
    const context = `${PrinterUtils.name}.${this.createPaymentEscPosBase64.name}`;
    const payment = await this.paymentRepository.findOne({ where: { slug } });

    const pngBuffer = await this.pdfService.generatePngFromTemplate(
      'payment',
      payment,
    );

    const { data: rawData, info: rawInfo } = await sharp(pngBuffer)
      .flatten({ background: '#ffffff' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let firstContentRow = 0;
    outer: for (let y = 0; y < rawInfo.height; y++) {
      for (let x = 0; x < rawInfo.width; x++) {
        const offset = (y * rawInfo.width + x) * rawInfo.channels;
        if (
          rawData[offset] < 240 ||
          rawData[offset + 1] < 240 ||
          rawData[offset + 2] < 240
        ) {
          firstContentRow = y;
          break outer;
        }
      }
    }

    const trimmedBuffer = await sharp(pngBuffer)
      .extract({
        left: 0,
        top: firstContentRow,
        width: rawInfo.width,
        height: rawInfo.height - firstContentRow,
      })
      .toBuffer();

    const rasterBase64 = await this.pngToEscPosRasterBase64(trimmedBuffer, 72);
    this.logger.log(
      `Built payment raster for ${slug}: png=${pngBuffer.length}B trimmed=${trimmedBuffer.length}B, base64=${rasterBase64.length} chars`,
      context,
    );
    return rasterBase64;
  }

  async printInvoice(
    printerIp: string,
    printerPort: string,
    orderSlug: string,
  ) {
    this.printerProducer.createPrintJob({
      jobType: PrinterJobType.INVOICE,
      printerIp,
      printerPort,
      orderSlug,
    });
  }

  async handlePrintInvoice(
    printerIp: string,
    printerPort: string,
    orderSlug: string,
  ) {
    const context = `${PrinterUtils.name}.${this.handlePrintInvoice.name}`;
    const buffersToSend = await this.invoiceService.exportBufferPng({
      order: orderSlug,
    } as ExportInvoiceDto);

    try {
      const socket = this.printerManager.getOrCreateConnection(
        printerIp,
        printerPort,
        PrinterType.ESC_POS,
      );

      await socket.send(buffersToSend);
    } catch (error) {
      this.logger.error(`Error printing invoice`, error.stack, context);
      throw new PrinterException(PrinterValidation.ERROR_PRINTING_INVOICE);
    } finally {
      this.logger.log(
        `Sent ${buffersToSend.length} invoice buffer for printer ${printerIp}:${printerPort}`,
        context,
      );
    }
  }
}
