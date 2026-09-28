import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from 'src/auth/decorator/public.decorator';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';
import { HasRoles } from 'src/role/roles.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { VatRequestService } from './vat-request.service';
import {
  CreateVatRequestDto,
  GetVatRequestQueryDto,
  UpdateVatRequestInfoDto,
  UpdateVatRequestStatusDto,
  VatRequestAvailabilityResponseDto,
} from './vat-request.dto';
import { VatRequest } from './vat-request.entity';

@ApiTags('Vat Request')
@Controller('vat-request')
@ApiBearerAuth()
export class VatRequestController {
  constructor(private readonly vatRequestService: VatRequestService) {}

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Public()
  @Get('public/:invoiceSlug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check VAT request availability for invoice' })
  @ApiParam({ name: 'invoiceSlug', description: 'The slug of the invoice' })
  async checkAvailability(@Param('invoiceSlug') invoiceSlug: string) {
    const result = await this.vatRequestService.checkAvailability(invoiceSlug);
    return {
      message: 'VAT request availability retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<VatRequestAvailabilityResponseDto>;
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  @Post('public/:invoiceSlug')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit VAT request for invoice' })
  @ApiParam({ name: 'invoiceSlug', description: 'The slug of the invoice' })
  @ApiResponse({ status: 409, description: 'VAT request already submitted' })
  async createVatRequest(
    @Param('invoiceSlug') invoiceSlug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: CreateVatRequestDto,
  ) {
    const result = await this.vatRequestService.create(invoiceSlug, dto);
    return {
      message: 'VAT request submitted successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<VatRequest>;
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @HasRoles(RoleEnum.Manager, RoleEnum.Admin, RoleEnum.SuperAdmin)
  @ApiOperation({ summary: 'Get all VAT requests' })
  async getAllVatRequests(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetVatRequestQueryDto,
  ) {
    const result = await this.vatRequestService.findAll(query);
    return {
      message: 'VAT requests retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<VatRequest>>;
  }

  @Patch(':slug')
  @HttpCode(HttpStatus.OK)
  @HasRoles(RoleEnum.Manager, RoleEnum.Admin, RoleEnum.SuperAdmin)
  @ApiOperation({ summary: 'Update VAT request customer info' })
  @ApiParam({ name: 'slug', description: 'The slug of the VAT request' })
  async updateInfo(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: UpdateVatRequestInfoDto,
  ) {
    const result = await this.vatRequestService.updateInfo(slug, dto);
    return {
      message: 'VAT request info updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<VatRequest>;
  }

  @Patch(':slug/status')
  @HttpCode(HttpStatus.OK)
  @HasRoles(RoleEnum.Manager, RoleEnum.Admin, RoleEnum.SuperAdmin)
  @ApiOperation({ summary: 'Update VAT request status' })
  @ApiParam({ name: 'slug', description: 'The slug of the VAT request' })
  async updateStatus(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: UpdateVatRequestStatusDto,
  ) {
    const result = await this.vatRequestService.updateStatus(slug, dto);
    return {
      message: 'VAT request status updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<VatRequest>;
  }
}
