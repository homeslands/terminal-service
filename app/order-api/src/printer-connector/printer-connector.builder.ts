import { Injectable, Logger, Inject } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  ChefOrderItemTicketDto,
  ChefOrderDto,
  TemporaryInvoiceDto,
  InvoiceDto,
  TsplCommand,
} from './printer-connector.dto';

// ── Constants ───────────────────────────────────────────────

const DOT_PER_MM = 8;

// Receipt-style (80 mm wide thermal paper)
const RECEIPT_WIDTH_MM = 80;
const LEFT = 10;
const LINE_HEIGHT = 28;
const SECTION_GAP = 12;

// Font sizing (pixel/dot equivalent used by printer-connector tspl_text)
const FONT_SIZE = 18;
const FONT_SIZE_HEADER = 32;

// ── Builder ─────────────────────────────────────────────────

@Injectable()
export class PrinterConnectorBuilder {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
  ) {}

  private formatCurrency(n: number): string {
    return new Intl.NumberFormat('vi-VN').format(n ?? 0);
  }

  private formatPaymentMethod(method: string): string {
    const map: Record<string, string> = {
      cash: 'Tien mat',
      bank: 'Chuyen khoan',
      point: 'Diem tich luy',
      momo: 'MoMo',
      zalopay: 'ZaloPay',
    };
    return map[method] || method;
  }

  /**
   * Wrap text into multiple lines based on estimated character width.
   * Vietnamese bitmap chars ≈ font_size * 0.6 dots wide on average.
   * @param maxLines - max number of lines (last line truncated with "..." if exceeded)
   */
  private wrapText(
    text: string,
    fontSize: number,
    xOffset: number,
    labelWidthDots: number,
    maxLines = 0,
  ): string[] {
    const charWidth = Math.ceil(fontSize * 0.6);
    const usableWidth = labelWidthDots - xOffset - 10; // 10 dots right margin
    const maxChars = Math.max(1, Math.floor(usableWidth / charWidth));

    if (text.length <= maxChars) return [text];

    const lines: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      // If this is the last allowed line, truncate with "..."
      if (maxLines > 0 && lines.length === maxLines - 1) {
        if (remaining.length > maxChars) {
          lines.push(remaining.substring(0, maxChars - 3).trimEnd() + '...');
        } else {
          lines.push(remaining);
        }
        break;
      }

      if (remaining.length <= maxChars) {
        lines.push(remaining);
        break;
      }
      // Try to break at last space within maxChars
      let breakAt = remaining.lastIndexOf(' ', maxChars);
      if (breakAt <= 0) breakAt = maxChars; // no space found, hard break
      lines.push(remaining.substring(0, breakAt).trimEnd());
      remaining = remaining.substring(breakAt).trimStart();
    }
    return lines;
  }

  private textCmd(
    x: number,
    y: number,
    content: string,
    fontSize = FONT_SIZE,
    bold = false,
  ): TsplCommand {
    return {
      type: 'tspl_text',
      params: { x, y, content: content ?? '', font_size: fontSize, bold },
    };
  }

  buildInvoiceTspl(data: InvoiceDto): { commands: TsplCommand[] } {
    const context = `${PrinterConnectorBuilder.name}.${this.buildInvoiceTspl.name}`;
    this.logger.log(`Build invoice TSPL for ${data.referenceNumber}`, context);

    const commands: TsplCommand[] = [];
    let y = 20;

    const addText = (
      x: number,
      content: string,
      fontSize = FONT_SIZE,
      bold = false,
    ) => {
      commands.push(this.textCmd(x, y, content, fontSize, bold));
    };

    const nextLine = (extra = 0) => {
      y += LINE_HEIGHT + extra;
    };

    // ── Header / Store info ──
    addText(LEFT + 100, 'HOA DON THANH TOAN', FONT_SIZE_HEADER, true);
    nextLine(LINE_HEIGHT);

    addText(LEFT, `Dia chi: ${data.branchAddress}`);
    nextLine();

    addText(LEFT, `Ma don: ${data.referenceNumber}`);
    nextLine(SECTION_GAP);

    // ── Order info ──
    addText(LEFT, `Thoi gian: ${data.createdAt}`);
    nextLine();

    addText(LEFT, `Khach hang: ${data.customer}`);
    nextLine();

    addText(LEFT, `Thu ngan: ${data.cashier}`);
    nextLine();

    if (data.type === 'at-table') {
      addText(LEFT, 'Hinh thuc: Tai ban');
      nextLine();
      addText(LEFT, `Ban: ${data.tableName ?? ''}`);
      nextLine();
    } else if (data.type === 'take-out') {
      addText(LEFT, 'Hinh thuc: Mang di');
      nextLine();
      addText(LEFT, `Thoi gian mang di: ${data.timeLeftTakeOut ?? ''} (phut)`);
      nextLine();
    } else if (data.type === 'delivery') {
      addText(LEFT, 'Hinh thuc: Giao hang');
      nextLine();
      addText(LEFT, `Giao hang toi: ${data.deliveryTo ?? ''}`);
      nextLine();
      addText(LEFT, `SDT: ${data.deliveryPhone ?? ''}`);
      nextLine();
    }

    if (data.description) {
      addText(LEFT, `Ghi chu: ${data.description}`);
      nextLine();
    }

    y += SECTION_GAP;

    // ── Table header ──
    const COL_QTY = 290;
    const COL_PRICE = 350;
    const COL_PROMO = 440;
    const COL_TOTAL = 520;

    addText(LEFT, 'Mon', FONT_SIZE, true);
    addText(COL_QTY, 'SL', FONT_SIZE, true);
    addText(COL_PRICE, 'D.Gia', FONT_SIZE, true);
    addText(COL_PROMO, 'K.Mai%', FONT_SIZE, true);
    addText(COL_TOTAL, 'T.Tien', FONT_SIZE, true);
    nextLine();

    // ── Invoice items ──
    for (const item of data.invoiceItems) {
      const name = `${item.productName} (${(item.size ?? '').toUpperCase()})`;
      addText(LEFT, name);
      addText(COL_QTY, `${item.quantity}`);

      let displayPrice = item.price;
      if (
        data.voucherType === 'same_price_product' &&
        item.discountType === 'voucher' &&
        item.price > (data.valueEachVoucher ?? 0)
      ) {
        displayPrice = data.valueEachVoucher ?? 0;
      } else if (
        data.voucherRule === 'at_least_one_required' &&
        (data.voucherType === 'percent_order' ||
          data.voucherType === 'fixed_value') &&
        item.discountType === 'voucher'
      ) {
        displayPrice = item.price - (item.voucherValue ?? 0) / item.quantity;
      }
      addText(COL_PRICE, this.formatCurrency(displayPrice));

      const promo =
        item.discountType === 'voucher' ? '0' : `${item.promotionValue ?? 0}`;
      addText(COL_PROMO, promo);

      let totalStr = this.formatCurrency(item.total);
      if (item.discountType === 'promotion') totalStr += ' (*)';
      else if (item.discountType === 'voucher') totalStr += ' (**)';
      addText(COL_TOTAL, totalStr);

      if (item.note) {
        nextLine();
        addText(LEFT + 20, `- ${item.note}`);
      }

      nextLine();
    }

    y += SECTION_GAP;

    // ── Totals ──
    addText(LEFT, `PTTT: ${this.formatPaymentMethod(data.paymentMethod)}`);
    nextLine();

    addText(LEFT, 'Tong cong (d)');
    addText(COL_TOTAL, this.formatCurrency(data.originalSubtotalOrder));
    nextLine();

    addText(LEFT, 'Tong khuyen mai (d)');
    addText(COL_TOTAL, this.formatCurrency(data.orderItemPromotionValue));
    nextLine();

    addText(LEFT, 'Tong giam gia (d)');
    addText(COL_TOTAL, this.formatCurrency(data.voucherValue));
    nextLine();

    if (data.type === 'delivery') {
      addText(LEFT, 'Phi giao hang (d)');
      addText(COL_TOTAL, this.formatCurrency(data.deliveryFee ?? 0));
      nextLine();
    }

    addText(LEFT, 'Diem tich luy da dung');
    addText(COL_TOTAL, this.formatCurrency(data.accumulatedPointsToUse));
    nextLine();

    if (data.paymentMethod === 'point') {
      addText(LEFT, 'So xu da tru');
      addText(COL_TOTAL, this.formatCurrency(data.usedPoints ?? 0));
      nextLine();
    }

    const finalAmount = data.paymentMethod === 'point' ? 0 : data.amount;
    addText(LEFT, 'THANH TIEN (d)', FONT_SIZE, true);
    addText(COL_TOTAL, this.formatCurrency(finalAmount), FONT_SIZE, true);
    nextLine(SECTION_GAP);

    // ── Footnotes ──
    addText(LEFT, '(*) SP uu dai theo chuong trinh khuyen mai');
    nextLine();
    addText(LEFT, '(**) SP uu dai theo ma giam gia');
    nextLine(SECTION_GAP);

    // ── Footer: wifi ──
    addText(LEFT, `Wifi: ${data.wifiName} - Mat khau: ${data.wifiPassword}`);
    nextLine();
    y += 20;

    // ── Assemble final commands ──
    const heightMM = Math.ceil(y / DOT_PER_MM) + 5;
    return {
      commands: [
        {
          type: 'tspl_setup',
          params: { width_mm: RECEIPT_WIDTH_MM, height_mm: heightMM },
        },
        ...commands,
        { type: 'tspl_print', params: { copies: 1 } },
      ],
    };
  }

  buildTemporaryInvoiceTspl(data: TemporaryInvoiceDto): {
    commands: TsplCommand[];
  } {
    const context = `${PrinterConnectorBuilder.name}.${this.buildTemporaryInvoiceTspl.name}`;
    this.logger.log(
      `Build temporary invoice TSPL for ${data.referenceNumber}`,
      context,
    );

    const commands: TsplCommand[] = [];
    let y = 20;

    const addText = (
      x: number,
      content: string,
      fontSize = FONT_SIZE,
      bold = false,
    ) => {
      commands.push(this.textCmd(x, y, content, fontSize, bold));
    };

    const nextLine = (extra = 0) => {
      y += LINE_HEIGHT + extra;
    };

    // ── Header ──
    addText(LEFT + 100, 'PHIEU TAM TINH', FONT_SIZE_HEADER, true);
    nextLine(LINE_HEIGHT);

    addText(LEFT, `Dia chi: ${data.branchAddress}`);
    nextLine();

    addText(LEFT, `Ma don: ${data.referenceNumber}`);
    nextLine(SECTION_GAP);

    // ── Order info ──
    addText(LEFT, `Thoi gian tao: ${data.createdAt}`);
    nextLine();

    addText(LEFT, `Thoi gian xuat: ${data.exportAt}`);
    nextLine();

    addText(LEFT, `Khach hang: ${data.customer}`);
    nextLine();

    addText(LEFT, `Thu ngan: ${data.cashier}`);
    nextLine();

    if (data.type === 'at-table') {
      addText(LEFT, 'Hinh thuc: Tai ban');
      nextLine();
      addText(LEFT, `Ban: ${data.tableName ?? ''}`);
      nextLine();
      if (data.description) {
        addText(LEFT, `Ghi chu: ${data.description}`);
        nextLine();
      }
    } else if (data.type === 'take-out') {
      addText(LEFT, 'Hinh thuc: Mang di');
      nextLine();
      addText(LEFT, `Thoi gian mang di: ${data.timeLeftTakeOut ?? ''} (phut)`);
      nextLine();
      if (data.description) {
        addText(LEFT, `Ghi chu: ${data.description}`);
        nextLine();
      }
    } else if (data.type === 'delivery') {
      addText(LEFT, 'Hinh thuc: Giao hang');
      nextLine();
      addText(LEFT, `Giao hang toi: ${data.deliveryTo ?? ''}`);
      nextLine();
      addText(LEFT, `SDT: ${data.deliveryPhone ?? ''}`);
      nextLine();
      if (data.description) {
        addText(LEFT, `Ghi chu: ${data.description}`);
        nextLine();
      }
    }

    y += SECTION_GAP;

    // ── Table header ──
    const COL_QTY = 290;
    const COL_PRICE = 350;
    const COL_PROMO = 440;
    const COL_TOTAL = 520;

    addText(LEFT, 'Mon', FONT_SIZE, true);
    addText(COL_QTY, 'SL', FONT_SIZE, true);
    addText(COL_PRICE, 'D.Gia', FONT_SIZE, true);
    addText(COL_PROMO, 'K.Mai%', FONT_SIZE, true);
    addText(COL_TOTAL, 'T.Tien', FONT_SIZE, true);
    nextLine();

    // ── Invoice items ──
    for (const item of data.invoiceItems) {
      const name = `${item.productName} (${(item.size ?? '').toUpperCase()})`;
      addText(LEFT, name);
      addText(COL_QTY, `${item.quantity}`);

      let displayPrice = item.price;
      if (
        data.voucherType === 'same_price_product' &&
        item.discountType === 'voucher' &&
        item.price > (data.valueEachVoucher ?? 0)
      ) {
        displayPrice = data.valueEachVoucher ?? 0;
      } else if (
        data.voucherRule === 'at_least_one_required' &&
        (data.voucherType === 'percent_order' ||
          data.voucherType === 'fixed_value') &&
        item.discountType === 'voucher'
      ) {
        displayPrice = item.price - (item.voucherValue ?? 0) / item.quantity;
      }
      addText(COL_PRICE, this.formatCurrency(displayPrice));

      const promo =
        item.discountType === 'voucher' ? '0' : `${item.promotionValue ?? 0}`;
      addText(COL_PROMO, promo);

      let totalStr = this.formatCurrency(item.total);
      if (item.discountType === 'promotion') totalStr += ' (*)';
      else if (item.discountType === 'voucher') totalStr += ' (**)';
      addText(COL_TOTAL, totalStr);

      if (item.note) {
        nextLine();
        addText(LEFT + 20, `- ${item.note}`);
      }

      nextLine();
    }

    y += SECTION_GAP;

    // ── Totals ──
    addText(LEFT, 'Tong cong (d)');
    addText(COL_TOTAL, this.formatCurrency(data.originalSubtotalOrder));
    nextLine();

    addText(LEFT, 'Tong khuyen mai (d)');
    addText(COL_TOTAL, this.formatCurrency(data.orderItemPromotionValue));
    nextLine();

    addText(LEFT, 'Tong giam gia (d)');
    addText(COL_TOTAL, this.formatCurrency(data.voucherValue));
    nextLine();

    addText(LEFT, 'Diem tich luy da dung (diem)');
    addText(COL_TOTAL, this.formatCurrency(data.accumulatedPointsToUse));
    nextLine();

    if (data.type === 'delivery') {
      addText(LEFT, 'Phi giao hang (d)');
      addText(COL_TOTAL, this.formatCurrency(data.deliveryFee ?? 0));
      nextLine();
    }

    addText(LEFT, 'THANH TIEN (d)', FONT_SIZE, true);
    addText(COL_TOTAL, this.formatCurrency(data.amount), FONT_SIZE, true);
    nextLine(SECTION_GAP);

    // ── Bank transfer info ──
    if (
      data.hasQrcode &&
      data.paymentMethod === 'bank-transfer' &&
      data.subtotal === data.amountPayment
    ) {
      addText(LEFT, 'Ma thanh toan ngan hang chi co hieu luc den:');
      nextLine();
      addText(LEFT, `${data.expiredAt ?? ''}`, FONT_SIZE, true);
      nextLine();
    } else {
      addText(LEFT, 'Vui long den quay de thanh toan tien mat');
      nextLine();
    }

    y += SECTION_GAP;

    // ── Footnotes ──
    addText(LEFT, '(*) SP uu dai theo chuong trinh khuyen mai');
    nextLine();
    addText(LEFT, '(**) SP uu dai theo ma giam gia');
    nextLine();
    y += 20;

    // ── Assemble final commands ──
    const heightMM = Math.ceil(y / DOT_PER_MM) + 5;
    return {
      commands: [
        {
          type: 'tspl_setup',
          params: { width_mm: RECEIPT_WIDTH_MM, height_mm: heightMM },
        },
        ...commands,
        { type: 'tspl_print', params: { copies: 1 } },
      ],
    };
  }

  buildChefOrderTspl(data: ChefOrderDto): { commands: TsplCommand[] } {
    const context = `${PrinterConnectorBuilder.name}.${this.buildChefOrderTspl.name}`;
    this.logger.log(
      `Build chef order TSPL for ${data.referenceNumber}`,
      context,
    );

    const commands: TsplCommand[] = [];
    let y = 20;

    const addText = (
      x: number,
      content: string,
      fontSize = FONT_SIZE,
      bold = false,
    ) => {
      commands.push(this.textCmd(x, y, content, fontSize, bold));
    };

    const nextLine = (extra = 0) => {
      y += LINE_HEIGHT + extra;
    };

    // ── Header ──
    addText(LEFT + 100, 'TREND COFFEE', FONT_SIZE_HEADER, true);
    nextLine(LINE_HEIGHT);

    addText(LEFT, `Ma don: ${data.referenceNumber}`);
    nextLine(SECTION_GAP);

    // ── Order info ──
    addText(LEFT, `Chi nhanh: ${data.branchName}`);
    nextLine();

    addText(LEFT, `Thoi gian: ${data.createdAt}`);
    nextLine();

    if (data.type === 'at-table') {
      addText(LEFT, 'Hinh thuc: Tai ban');
      nextLine();
      addText(LEFT, `Ban: ${data.tableName ?? ''}`);
      nextLine();
    } else if (data.type === 'take-out') {
      addText(LEFT, 'Hinh thuc: Mang di');
      nextLine();
      addText(LEFT, `Thoi gian mang di: ${data.timeLeftTakeOut ?? 0} (phut)`);
      nextLine();
    } else if (data.type === 'delivery') {
      addText(LEFT, 'Hinh thuc: Giao hang');
      nextLine();
      addText(LEFT, `Giao hang toi: ${data.deliveryTo ?? ''}`);
      nextLine();
      addText(LEFT, `SDT: ${data.deliveryPhone ?? ''}`);
      nextLine();
    }

    addText(LEFT, `Ghi chu: ${data.description || 'Khong co ghi chu'}`);
    nextLine();

    y += SECTION_GAP;

    // ── Table header ──
    const COL_SIZE = 230;
    const COL_QTY = 340;
    const COL_NOTE = 410;

    addText(LEFT, 'Mon', FONT_SIZE, true);
    addText(COL_SIZE, 'Size', FONT_SIZE, true);
    addText(COL_QTY, 'SL', FONT_SIZE, true);
    addText(COL_NOTE, 'Ghi chu', FONT_SIZE, true);
    nextLine();

    // ── Chef order items ──
    for (const item of data.chefOrderItems) {
      addText(LEFT, item.productName);
      addText(COL_SIZE, (item.size ?? '').toUpperCase());
      addText(COL_QTY, `${item.quantity}`);
      addText(COL_NOTE, item.note || '');
      nextLine();
    }

    y += 20;

    // ── Assemble final commands ──
    const heightMM = Math.ceil(y / DOT_PER_MM) + 5;
    return {
      commands: [
        {
          type: 'tspl_setup',
          params: { width_mm: RECEIPT_WIDTH_MM, height_mm: heightMM },
        },
        ...commands,
        { type: 'tspl_print', params: { copies: 1 } },
      ],
    };
  }

  buildChefOrderItemTicketTspl(data: ChefOrderItemTicketDto): {
    commands: TsplCommand[];
  } {
    const context = `${PrinterConnectorBuilder.name}.${this.buildChefOrderItemTicketTspl.name}`;
    this.logger.log(
      `Build chef order item ticket TSPL for ${data.referenceNumber}`,
      context,
    );

    // Cup-sticker label: 50 mm × 30 mm → 400 × 240 dots (DOT_PER_MM = 8)
    // Layout: 5 dòng tối đa — header (1) + product (≤2) + note (≤3)
    const LABEL_WIDTH_MM = 50;
    const LABEL_HEIGHT_MM = 30;
    const LABEL_GAP_MM = 2;
    const LABEL_WIDTH_DOTS = LABEL_WIDTH_MM * DOT_PER_MM; // 400
    const LBL_LEFT = 15;
    const LINE_SPACING = 3;

    const FONT_HEADER = 12;
    const FONT_PRODUCT = 14;
    const FONT_BODY = 12;

    // Bitmap height ≈ font_size * 2.4 (font12 → 29 dots, font14 → 34 dots)
    // → line pitch font12 ≈ 32, font14 ≈ 37 (vừa khít label 50×30mm)
    const bitmapHeight = (fs: number) => Math.ceil(fs * 2.4);

    const commands: TsplCommand[] = [];
    let y = 20;

    const addText = (
      x: number,
      content: string,
      fontSize: number,
      bold = false,
    ) => {
      commands.push({
        type: 'tspl_text',
        params: { x, y, content: content ?? '', font_size: fontSize, bold },
      });
    };

    const addWrappedText = (
      x: number,
      text: string,
      fontSize: number,
      bold = false,
      maxLines = 0,
    ) => {
      const wrapped = this.wrapText(
        text,
        fontSize,
        x,
        LABEL_WIDTH_DOTS,
        maxLines,
      );
      for (const line of wrapped) {
        addText(x, line, fontSize, bold);
        y += bitmapHeight(fontSize) + LINE_SPACING;
      }
    };

    const nextLine = (fontSize: number) => {
      y += bitmapHeight(fontSize) + LINE_SPACING;
    };

    // ── Row 1: Header + Order ref (bold) ──
    addText(
      LBL_LEFT,
      `TREND COFFEE - ${data.referenceNumber}`,
      FONT_HEADER,
      true,
    );
    nextLine(FONT_HEADER);

    // ── Row 2-3: Product name + variant (max 2 lines, không bold) ──
    addWrappedText(
      LBL_LEFT,
      `${data.productName} (${(data.variantName ?? '').toUpperCase()})`,
      FONT_PRODUCT,
      false,
      2,
    );

    // ── Row 4-6: Note (max 3 lines, không bold) ──
    if (data.note) {
      addWrappedText(LBL_LEFT, `Ghi chu: ${data.note}`, FONT_BODY, false, 3);
    }

    return {
      commands: [
        {
          type: 'tspl_setup',
          params: {
            width_mm: LABEL_WIDTH_MM,
            height_mm: LABEL_HEIGHT_MM,
            gap_mm: LABEL_GAP_MM,
          },
        },
        { type: 'tspl_cls' },
        ...commands,
        { type: 'tspl_print', params: { copies: 1 } },
      ],
    };
  }
}
