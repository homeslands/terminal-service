import { Injectable, Logger, Inject } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { PrinterConnectorBuilder } from './printer-connector.builder';
import { PrinterConnectorClient } from './printer-connector.client';
import {
  InvoiceDto,
  TemporaryInvoiceDto,
  ChefOrderDto,
  ChefOrderItemTicketDto,
} from './printer-connector.dto';

@Injectable()
export class PrinterConnectorUtils {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly printerConnectorBuilder: PrinterConnectorBuilder,
    private readonly printerConnectorClient: PrinterConnectorClient,
  ) {}

  async printInvoice(
    branchSlug: string,
    printerId: string,
    data: InvoiceDto,
    copyIndex?: number,
    attemptsMade = 0,
  ) {
    const context = `${PrinterConnectorUtils.name}.${this.printInvoice.name}`;
    this.logger.log(`Print invoice for ${data.referenceNumber}`, context);
    const payload = this.printerConnectorBuilder.buildInvoiceTspl(data);
    // printerId đảm bảo unique khi nhiều máy in, copyIndex cho nhiều bản,
    // attemptsMade đảm bảo external_id mới khi retry
    const base =
      copyIndex !== undefined
        ? `invoice-${data.referenceNumber}-${printerId}-${copyIndex}`
        : `invoice-${data.referenceNumber}-${printerId}`;
    await this.printerConnectorClient.createJob(branchSlug, {
      external_id: `${base}-${attemptsMade}`,
      template: 'raw_tspl',
      target: { type: 'printer_id', value: printerId },
      priority: 1,
      payload,
    });
  }

  async printInvoicePassthrough(
    branchSlug: string,
    printerId: string,
    externalId: string,
    rawBase64: string,
    attemptsMade = 0,
    copies = 1,
  ) {
    const context = `${PrinterConnectorUtils.name}.${this.printInvoicePassthrough.name}`;
    this.logger.log(
      `Print invoice passthrough for ${externalId}, payload size: ${rawBase64.length}`,
      context,
    );
    await this.printerConnectorClient.createJob(branchSlug, {
      external_id: `invoice-${externalId}-${attemptsMade}`,
      template: 'raw_passthrough',
      target: { type: 'printer_id', value: printerId },
      copies,
      priority: 1,
      payload: { raw_base64: rawBase64 },
    });
  }

  async printTemporaryInvoice(
    branchSlug: string,
    printerId: string,
    data: TemporaryInvoiceDto,
  ) {
    const context = `${PrinterConnectorUtils.name}.${this.printTemporaryInvoice.name}`;
    this.logger.log(
      `Print temporary invoice for ${data.referenceNumber}`,
      context,
    );
    const payload =
      this.printerConnectorBuilder.buildTemporaryInvoiceTspl(data);
    await this.printerConnectorClient.createJob(branchSlug, {
      external_id: `temp-invoice-${data.referenceNumber}`,
      template: 'raw_tspl',
      target: { type: 'printer_id', value: printerId },
      priority: 1,
      payload,
    });
  }

  async printChefOrderPassthrough(
    branchSlug: string,
    printerId: string,
    externalId: string,
    rawBase64: string,
    attemptsMade = 0,
    copies = 1,
  ) {
    const context = `${PrinterConnectorUtils.name}.${this.printChefOrderPassthrough.name}`;
    this.logger.log(
      `Print chef order passthrough for ${externalId}, payload size: ${rawBase64.length}`,
      context,
    );
    await this.printerConnectorClient.createJob(branchSlug, {
      external_id: `chef-order-${externalId}-${attemptsMade}`,
      template: 'raw_passthrough',
      target: { type: 'printer_id', value: printerId },
      copies,
      priority: 1,
      payload: { raw_base64: rawBase64 },
    });
  }

  async printChefOrder(
    branchSlug: string,
    printerId: string,
    data: ChefOrderDto,
    copyIndex?: number,
    attemptsMade = 0,
  ) {
    const context = `${PrinterConnectorUtils.name}.${this.printChefOrder.name}`;
    this.logger.log(`Print chef order for ${data.referenceNumber}`, context);
    const payload = this.printerConnectorBuilder.buildChefOrderTspl(data);
    // printerId đảm bảo unique khi nhiều máy in, attemptsMade đảm bảo external_id mới khi retry
    const base =
      copyIndex !== undefined
        ? `chef-order-${data.referenceNumber}-${data.chefOrderSlug}-${printerId}-${copyIndex}`
        : `chef-order-${data.referenceNumber}-${data.chefOrderSlug}-${printerId}`;
    await this.printerConnectorClient.createJob(branchSlug, {
      external_id: `${base}-${attemptsMade}`,
      template: 'raw_tspl',
      target: { type: 'printer_id', value: printerId },
      priority: 1,
      payload,
    });
  }

  async printChefOrderItemTicket(
    branchSlug: string,
    printerId: string,
    data: ChefOrderItemTicketDto,
    attemptsMade = 0,
    copies = 1,
    quantityIndex = 0,
  ) {
    const context = `${PrinterConnectorUtils.name}.${this.printChefOrderItemTicket.name}`;
    this.logger.log(
      `Print chef order item ticket for ${data.referenceNumber}`,
      context,
    );
    const payload =
      this.printerConnectorBuilder.buildChefOrderItemTicketTspl(data);
    // external_id bao gồm printerId để tránh dedup khi có nhiều máy in,
    // và attemptsMade để mỗi lần retry tạo external_id mới
    const externalId = `label-${data.referenceNumber}-${data.chefOrderItemSlug}-q${quantityIndex}-${printerId}-${attemptsMade}`;
    await this.printerConnectorClient.createJob(branchSlug, {
      external_id: externalId,
      template: 'raw_tspl',
      target: { type: 'printer_id', value: printerId },
      copies,
      priority: 1,
      payload,
    });
  }

}
