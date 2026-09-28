import { AutoMap } from '@automapper/classes';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional } from 'class-validator';
import {
  PRINTER_CONNECTOR_URL_INVALID,
  PRINTER_CONNECTOR_API_KEY_INVALID,
  BRANCH_SLUG_INVALID,
} from './printer-connector.validation';
import { BaseResponseDto } from 'src/app/base.dto';

export class CreatePrinterConnectorDto {
  @AutoMap()
  @ApiProperty({ example: 'branch-slug' })
  @IsNotEmpty({ message: BRANCH_SLUG_INVALID })
  branchSlug: string;

  @AutoMap()
  @ApiProperty({ example: 'http://192.168.1.100:8100' })
  @IsNotEmpty({ message: PRINTER_CONNECTOR_URL_INVALID })
  url: string;

  @AutoMap()
  @ApiProperty({ example: 'pa_live_a1b2c3d4e5f6a7b8c0e1f2' })
  @IsNotEmpty({ message: PRINTER_CONNECTOR_API_KEY_INVALID })
  apiKey: string;
}

export class UpdatePrinterConnectorDto {
  @AutoMap()
  @ApiProperty({ example: 'http://192.168.1.100:8100' })
  @IsOptional()
  url?: string;

  @AutoMap()
  @ApiProperty({ example: 'pa_live_a1b2c3d4e5f6a8c9d0e1f2' })
  @IsOptional()
  apiKey?: string;
}

export class PrinterConnectorResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  url: string;

  @AutoMap()
  @ApiProperty()
  apiKey: string;
}

// ── TSPL Builder DTOs ───────────────────────────────────────

export class ChefOrderItemTicketDto {
  referenceNumber: string;
  chefOrderItemSlug: string;
  createdAt: string;
  productName: string;
  variantName: string;
  note?: string;
}

export class ChefOrderItemDto {
  productName: string;
  size: string;
  quantity: number;
  note?: string;
}

export class ChefOrderDto {
  referenceNumber: string;
  chefOrderSlug: string;
  branchName: string;
  tableName?: string;
  createdAt: string;
  description?: string;
  type: 'at-table' | 'take-out' | 'delivery';
  timeLeftTakeOut?: number;
  deliveryPhone?: string;
  deliveryTo?: string;
  chefOrderItems: ChefOrderItemDto[];
}

export class InvoiceItemDto {
  productName: string;
  size: string;
  quantity: number;
  price: number;
  note?: string;
  promotionValue?: number;
  total: number;
  discountType?: string;
  voucherValue?: number;
}

export class TemporaryInvoiceDto {
  branchAddress: string;
  referenceNumber: string;
  createdAt: string;
  exportAt: string;
  customer: string;
  cashier: string;
  type: 'at-table' | 'take-out' | 'delivery';
  tableName?: string;
  description?: string;
  timeLeftTakeOut?: number;
  deliveryTo?: string;
  deliveryPhone?: string;
  invoiceItems: InvoiceItemDto[];
  voucherType?: string;
  voucherRule?: string;
  valueEachVoucher?: number;
  originalSubtotalOrder: number;
  orderItemPromotionValue: number;
  voucherValue: number;
  accumulatedPointsToUse: number;
  deliveryFee?: number;
  amount: number;
  paymentMethod: string;
  subtotal: number;
  amountPayment: number;
  expiredAt?: string;
  hasQrcode: boolean;
}

export class InvoiceDto {
  branchAddress: string;
  referenceNumber: string;
  createdAt: string;
  customer: string;
  cashier: string;
  type: 'at-table' | 'take-out' | 'delivery';
  tableName?: string;
  description?: string;
  timeLeftTakeOut?: number;
  deliveryTo?: string;
  deliveryPhone?: string;
  invoiceItems: InvoiceItemDto[];
  paymentMethod: string;
  originalSubtotalOrder: number;
  orderItemPromotionValue: number;
  voucherCode: string;
  voucherValue: number;
  voucherType?: string;
  voucherRule?: string;
  valueEachVoucher?: number;
  deliveryFee?: number;
  accumulatedPointsToUse: number;
  usedPoints?: number;
  amount: number;
  wifiName: string;
  wifiPassword: string;
}

// ── Print Job DTOs ──────────────────────────────────────────

export class PrintJobTargetDto {
  @ApiProperty({ example: 'printer_id', enum: ['role', 'printer_id'] })
  @IsNotEmpty()
  type: 'role' | 'printer_id';

  @ApiProperty({ example: 'printer-001' })
  @IsNotEmpty()
  value: string;
}

export type TsplCommand =
  | {
      type: 'tspl_setup';
      params: { width_mm: number; height_mm: number; gap_mm?: number };
    }
  | { type: 'tspl_cls' }
  | {
      type: 'tspl_text';
      params: {
        x: number;
        y: number;
        content: string;
        font_size: number;
        bold?: boolean;
      };
    }
  | {
      type: 'tspl_qrcode';
      params: {
        x: number;
        y: number;
        content: string;
        cell_width: number;
        ecc?: 'L' | 'M' | 'Q' | 'H';
      };
    }
  | {
      type: 'tspl_print';
      params: { copies: number };
    };

export class CreatePrintJobRequestDto {
  @ApiProperty({ example: 'test-tspl-002' })
  @IsNotEmpty()
  external_id: string;

  @ApiProperty({ example: 'raw_tspl' })
  @IsNotEmpty()
  template: string;

  @ApiProperty({ type: PrintJobTargetDto })
  @IsNotEmpty()
  target: PrintJobTargetDto;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  copies?: number;

  @ApiProperty({ example: 2, required: false })
  @IsOptional()
  priority?: number;

  @ApiProperty({
    example: {
      raw_tspl:
        'SIZE 50 mm,30 mm\nGAP 2 mm,0\nCLS\nTEXT 20,20,"0",0,1,1,"Tra sua tran chau"\nPRINT 1,1',
    },
  })
  @IsNotEmpty()
  payload:
    | { raw_tspl: string }
    | { raw_base64: string }
    | { commands: TsplCommand[] };
}

export class CreatePrintJobResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  external_id: string;

  @ApiProperty()
  printer_id: string;

  @ApiProperty()
  template: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  priority: number;

  @ApiProperty()
  idempotency_key: string;

  @ApiProperty()
  created_at: string;
}
