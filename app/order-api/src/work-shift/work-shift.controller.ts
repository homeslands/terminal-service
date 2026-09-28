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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkShiftService } from './work-shift.service';
import {
  CloseWorkShiftRequestDto,
  ForceCloseWorkShiftRequestDto,
  GetWorkShiftsQueryDto,
  OpenWorkShiftRequestDto,
  ShiftStaffSummaryDto,
  WorkShiftListResponseDto,
  WorkShiftResponseDto,
  WorkShiftSummaryResponseDto,
} from './work-shift.dto';
import { HasRoles } from 'src/role/roles.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { CurrentUser } from 'src/user/user.decorator';
import { CurrentUserDto } from 'src/user/user.dto';
import { AppResponseDto } from 'src/app/app.dto';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { OrderResponseDto } from 'src/order/order.dto';
import { InvoiceResponseDto } from 'src/invoice/invoice.dto';

@Controller('work-shifts')
@ApiBearerAuth()
@ApiTags('Work Shift')
export class WorkShiftController {
  constructor(private readonly workShiftService: WorkShiftService) {}

  // -------------------------------------------------------------------------
  // Cashier — open / close
  // -------------------------------------------------------------------------

  @Post('open')
  @HasRoles(RoleEnum.Cashier)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Open a new work shift (Cashier only)' })
  @ApiResponseWithType({
    type: WorkShiftResponseDto,
    status: HttpStatus.CREATED,
    description: 'Work shift opened successfully',
  })
  async openShift(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: OpenWorkShiftRequestDto,
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    currentUser: CurrentUserDto,
  ) {
    const result = await this.workShiftService.openShift(body, currentUser);
    return {
      message: 'Work shift opened successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<WorkShiftResponseDto>;
  }

  @Patch('close')
  @HasRoles(RoleEnum.Cashier)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close current work shift (Cashier only)' })
  @ApiResponseWithType({
    type: WorkShiftSummaryResponseDto,
    status: HttpStatus.OK,
    description: 'Work shift closed successfully',
  })
  async closeShift(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: CloseWorkShiftRequestDto,
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    currentUser: CurrentUserDto,
  ) {
    const result = await this.workShiftService.closeShift(body, currentUser);
    return {
      message: 'Work shift closed successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<WorkShiftSummaryResponseDto>;
  }

  // -------------------------------------------------------------------------
  // Cashier — current shift queries
  // -------------------------------------------------------------------------

  @Get('current')
  @HasRoles(RoleEnum.Cashier)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current active shift (Cashier only)' })
  @ApiResponseWithType({
    type: WorkShiftResponseDto,
    status: HttpStatus.OK,
    description: 'Current work shift retrieved successfully',
  })
  async getCurrentShift(
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    currentUser: CurrentUserDto,
  ) {
    const result = await this.workShiftService.getCurrentShift(currentUser);
    return {
      message: 'Current work shift retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<WorkShiftResponseDto>;
  }

  @Get('current/orders')
  @HasRoles(RoleEnum.Cashier)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Orders in current shift (Cashier only)' })
  @ApiResponseWithType({
    type: OrderResponseDto,
    isArray: true,
    status: HttpStatus.OK,
    description: 'Current shift orders retrieved successfully',
  })
  async getCurrentOrders(
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    currentUser: CurrentUserDto,
  ) {
    const result = await this.workShiftService.getCurrentOrders(currentUser);
    return {
      message: 'Current shift orders retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<OrderResponseDto[]>;
  }

  @Get('current/invoices')
  @HasRoles(RoleEnum.Cashier)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invoices in current shift (Cashier only)' })
  @ApiResponseWithType({
    type: InvoiceResponseDto,
    isArray: true,
    status: HttpStatus.OK,
    description: 'Current shift invoices retrieved successfully',
  })
  async getCurrentInvoices(
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    currentUser: CurrentUserDto,
  ) {
    const result = await this.workShiftService.getCurrentInvoices(currentUser);
    return {
      message: 'Current shift invoices retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<InvoiceResponseDto[]>;
  }

  @Get('current/staff')
  @HasRoles(RoleEnum.Cashier)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff in current shift (Cashier only)' })
  @ApiResponseWithType({
    type: ShiftStaffSummaryDto,
    isArray: true,
    status: HttpStatus.OK,
    description: 'Current shift staff retrieved successfully',
  })
  async getCurrentStaff(
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    currentUser: CurrentUserDto,
  ) {
    const result = await this.workShiftService.getCurrentStaff(currentUser);
    return {
      message: 'Current shift staff retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ShiftStaffSummaryDto[]>;
  }

  @Get('current/summary')
  @HasRoles(RoleEnum.Cashier)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Summary of current shift (Cashier only)' })
  @ApiResponseWithType({
    type: WorkShiftSummaryResponseDto,
    status: HttpStatus.OK,
    description: 'Current shift summary retrieved successfully',
  })
  async getCurrentSummary(
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    currentUser: CurrentUserDto,
  ) {
    const result = await this.workShiftService.getCurrentSummary(currentUser);
    return {
      message: 'Current shift summary retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<WorkShiftSummaryResponseDto>;
  }

  // -------------------------------------------------------------------------
  // Manager/Admin — active shifts list
  // -------------------------------------------------------------------------

  @Get('active')
  @HasRoles(RoleEnum.Manager, RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List all active shifts (Manager/Admin)' })
  @ApiResponseWithType({
    type: WorkShiftResponseDto,
    isArray: true,
    status: HttpStatus.OK,
    description: 'Active work shifts retrieved successfully',
  })
  async getActiveShifts(
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    currentUser: CurrentUserDto,
  ) {
    const result = await this.workShiftService.getActiveShifts(currentUser);
    return {
      message: 'Active work shifts retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<WorkShiftResponseDto[]>;
  }

  // -------------------------------------------------------------------------
  // Shared — list & detail
  // -------------------------------------------------------------------------

  @Get()
  @HasRoles(
    RoleEnum.Cashier,
    RoleEnum.Manager,
    RoleEnum.Admin,
    RoleEnum.SuperAdmin,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List work shifts (paginated)' })
  @ApiResponseWithType({
    type: WorkShiftListResponseDto,
    status: HttpStatus.OK,
    description: 'Work shifts retrieved successfully',
  })
  async getList(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetWorkShiftsQueryDto,
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    currentUser: CurrentUserDto,
  ) {
    const result = await this.workShiftService.getList(query, currentUser);
    return {
      message: 'Work shifts retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<WorkShiftListResponseDto>;
  }

  @Get(':slug')
  @HasRoles(
    RoleEnum.Cashier,
    RoleEnum.Manager,
    RoleEnum.Admin,
    RoleEnum.SuperAdmin,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get work shift detail by slug' })
  @ApiResponseWithType({
    type: WorkShiftResponseDto,
    status: HttpStatus.OK,
    description: 'Work shift retrieved successfully',
  })
  async getBySlug(
    @Param('slug') slug: string,
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    currentUser: CurrentUserDto,
  ) {
    const result = await this.workShiftService.getBySlug(slug, currentUser);
    return {
      message: 'Work shift retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<WorkShiftResponseDto>;
  }

  @Get(':slug/orders')
  @HasRoles(
    RoleEnum.Cashier,
    RoleEnum.Manager,
    RoleEnum.Admin,
    RoleEnum.SuperAdmin,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Orders of a specific shift (incl. cross-shift 2h)',
  })
  @ApiResponseWithType({
    type: OrderResponseDto,
    isArray: true,
    status: HttpStatus.OK,
    description: 'Work shift orders retrieved successfully',
  })
  async getOrders(
    @Param('slug') slug: string,
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    currentUser: CurrentUserDto,
  ) {
    const result = await this.workShiftService.getOrders(slug, currentUser);
    return {
      message: 'Work shift orders retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<OrderResponseDto[]>;
  }

  @Get(':slug/invoices')
  @HasRoles(
    RoleEnum.Cashier,
    RoleEnum.Manager,
    RoleEnum.Admin,
    RoleEnum.SuperAdmin,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invoices paid during a specific shift' })
  @ApiResponseWithType({
    type: InvoiceResponseDto,
    isArray: true,
    status: HttpStatus.OK,
    description: 'Work shift invoices retrieved successfully',
  })
  async getInvoices(
    @Param('slug') slug: string,
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    currentUser: CurrentUserDto,
  ) {
    const result = await this.workShiftService.getInvoices(slug, currentUser);
    return {
      message: 'Work shift invoices retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<InvoiceResponseDto[]>;
  }

  @Get(':slug/staff')
  @HasRoles(
    RoleEnum.Cashier,
    RoleEnum.Manager,
    RoleEnum.Admin,
    RoleEnum.SuperAdmin,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff who created orders in a specific shift' })
  @ApiResponseWithType({
    type: ShiftStaffSummaryDto,
    isArray: true,
    status: HttpStatus.OK,
    description: 'Work shift staff retrieved successfully',
  })
  async getStaff(
    @Param('slug') slug: string,
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    currentUser: CurrentUserDto,
  ) {
    const result = await this.workShiftService.getStaff(slug, currentUser);
    return {
      message: 'Work shift staff retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ShiftStaffSummaryDto[]>;
  }

  @Get(':slug/summary')
  @HasRoles(
    RoleEnum.Cashier,
    RoleEnum.Manager,
    RoleEnum.Admin,
    RoleEnum.SuperAdmin,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Full summary of a specific shift' })
  @ApiResponseWithType({
    type: WorkShiftSummaryResponseDto,
    status: HttpStatus.OK,
    description: 'Work shift summary retrieved successfully',
  })
  async getSummary(
    @Param('slug') slug: string,
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    currentUser: CurrentUserDto,
  ) {
    const result = await this.workShiftService.getSummary(slug, currentUser);
    return {
      message: 'Work shift summary retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<WorkShiftSummaryResponseDto>;
  }

  // -------------------------------------------------------------------------
  // Manager/Admin — force-close
  // -------------------------------------------------------------------------

  @Patch(':slug/force-close')
  @HasRoles(RoleEnum.Manager, RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Force-close a stuck shift (Manager/Admin)' })
  @ApiResponseWithType({
    type: WorkShiftSummaryResponseDto,
    status: HttpStatus.OK,
    description: 'Work shift force-closed successfully',
  })
  async forceClose(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: ForceCloseWorkShiftRequestDto,
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    currentUser: CurrentUserDto,
  ) {
    const result = await this.workShiftService.forceClose(
      slug,
      body,
      currentUser,
    );
    return {
      message: 'Work shift force-closed successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<WorkShiftSummaryResponseDto>;
  }
}
