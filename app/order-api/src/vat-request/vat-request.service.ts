import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import moment from 'moment';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VatRequest } from './vat-request.entity';
import { Invoice } from 'src/invoice/invoice.entity';
import {
  CreateVatRequestDto,
  GetVatRequestQueryDto,
  UpdateVatRequestInfoDto,
  UpdateVatRequestStatusDto,
  VatRequestAvailabilityResponseDto,
} from './vat-request.dto';
import { VatRequestStatus } from './vat-request.constants';
import { VatRequestException } from './vat-request.exception';
import { VatRequestValidation } from './vat-request.validation';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { MailService } from 'src/mail/mail.service';

@Injectable()
export class VatRequestService {
  constructor(
    @InjectRepository(VatRequest)
    private readonly vatRequestRepository: Repository<VatRequest>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly mailService: MailService,
  ) {}

  async checkAvailability(
    invoiceSlug: string,
  ): Promise<VatRequestAvailabilityResponseDto> {
    const invoice = await this.invoiceRepository.findOne({
      where: { slug: invoiceSlug },
    });
    if (!invoice) {
      throw new VatRequestException(
        VatRequestValidation.INVOICE_NOT_FOUND_FOR_VAT,
      );
    }
    const existing = await this.vatRequestRepository.findOne({
      where: { invoiceId: invoice.id },
    });
    return {
      invoiceSlug,
      status: existing ? 'SUBMITTED' : 'AVAILABLE',
    };
  }

  async create(
    invoiceSlug: string,
    dto: CreateVatRequestDto,
  ): Promise<VatRequest> {
    const context = `${VatRequestService.name}.${this.create.name}`;
    const invoice = await this.invoiceRepository.findOne({
      where: { slug: invoiceSlug },
    });
    if (!invoice) {
      throw new VatRequestException(
        VatRequestValidation.INVOICE_NOT_FOUND_FOR_VAT,
      );
    }
    const existing = await this.vatRequestRepository.findOne({
      where: { invoiceId: invoice.id },
    });
    if (existing) {
      throw new VatRequestException(
        VatRequestValidation.VAT_REQUEST_ALREADY_EXISTS,
        undefined,
        HttpStatus.CONFLICT,
      );
    }
    const vatRequest = this.vatRequestRepository.create({
      ...dto,
      invoiceId: invoice.id,
      status: VatRequestStatus.PENDING,
    });
    const saved = await this.vatRequestRepository.save(vatRequest);
    this.logger.log(
      `VAT request ${saved.slug} created for invoice ${invoiceSlug}`,
      context,
    );
    await this.mailService
      .sendVatRequestConfirmation(
        dto.email,
        invoiceSlug,
        invoice.referenceNumber,
        dto,
      )
      .catch((err) =>
        this.logger.error(
          `Failed to send VAT confirmation email: ${err.message}`,
          err.stack,
          context,
        ),
      );
    return saved;
  }

  async findAll(
    query: GetVatRequestQueryDto,
  ): Promise<AppPaginatedResponseDto<VatRequest>> {
    const {
      page,
      size,
      status,
      customerName,
      taxCode,
      email,
      invoiceNumber,
      referenceNumber,
      startDate,
      endDate,
    } = query;
    const qb = this.vatRequestRepository
      .createQueryBuilder('vr')
      .leftJoinAndSelect('vr.invoice', 'invoice')
      .leftJoinAndSelect('invoice.invoiceItems', 'invoiceItems')
      .orderBy('vr.createdAt', 'DESC')
      .skip((page - 1) * size)
      .take(size);

    if (status) qb.andWhere('vr.status = :status', { status });
    if (customerName)
      qb.andWhere('vr.customerName LIKE :customerName', {
        customerName: `%${customerName}%`,
      });
    if (taxCode) qb.andWhere('vr.taxCode = :taxCode', { taxCode });
    if (email) qb.andWhere('vr.email = :email', { email });
    if (invoiceNumber)
      qb.andWhere('vr.invoiceNumber = :invoiceNumber', { invoiceNumber });
    if (referenceNumber)
      qb.andWhere('invoice.referenceNumber = :referenceNumber', {
        referenceNumber,
      });
    if (startDate)
      qb.andWhere('vr.createdAt >= :startDate', {
        startDate: moment(startDate).startOf('day').toDate(),
      });
    if (endDate)
      qb.andWhere('vr.createdAt <= :endDate', {
        endDate: moment(endDate).endOf('day').toDate(),
      });

    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page,
      pageSize: size,
      totalPages: Math.ceil(total / size),
      hasPrevios: page > 1,
      hasNext: page * size < total,
    };
  }

  async updateInfo(
    slug: string,
    dto: UpdateVatRequestInfoDto,
  ): Promise<VatRequest> {
    const context = `${VatRequestService.name}.${this.updateInfo.name}`;
    const vatRequest = await this.vatRequestRepository.findOne({
      where: { slug },
    });
    if (!vatRequest) {
      throw new VatRequestException(VatRequestValidation.VAT_REQUEST_NOT_FOUND);
    }
    if (dto.customerName !== undefined)
      vatRequest.customerName = dto.customerName;
    if (dto.taxCode !== undefined) vatRequest.taxCode = dto.taxCode;
    if (dto.address !== undefined) vatRequest.address = dto.address;
    if (dto.email !== undefined) vatRequest.email = dto.email;
    if (dto.companyName !== undefined) vatRequest.companyName = dto.companyName;
    if (dto.note !== undefined) vatRequest.note = dto.note;
    const saved = await this.vatRequestRepository.save(vatRequest);
    this.logger.log(`VAT request ${slug} info updated`, context);
    return saved;
  }

  async updateStatus(
    slug: string,
    dto: UpdateVatRequestStatusDto,
  ): Promise<VatRequest> {
    const context = `${VatRequestService.name}.${this.updateStatus.name}`;
    const vatRequest = await this.vatRequestRepository.findOne({
      where: { slug },
    });
    if (!vatRequest) {
      throw new VatRequestException(VatRequestValidation.VAT_REQUEST_NOT_FOUND);
    }
    vatRequest.status = dto.status;
    if (dto.invoiceNumber !== undefined)
      vatRequest.invoiceNumber = dto.invoiceNumber;
    if (dto.note !== undefined) vatRequest.accountantNote = dto.note;
    const saved = await this.vatRequestRepository.save(vatRequest);
    this.logger.log(
      `VAT request ${slug} status updated to ${dto.status}`,
      context,
    );
    return saved;
  }
}
