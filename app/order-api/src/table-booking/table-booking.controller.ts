import {
  Controller,
  Post,
  Get,
  HttpCode,
  HttpStatus,
  Body,
  Query,
  ValidationPipe,
  Patch,
  Param,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { TableBookingService } from './table-booking.service';
import {
  CreateTableBookingDto,
  GetTableBookingQueryDto,
  TableBookingResponseDto,
  UpdateTableBookingDto,
} from './table-booking.dto';
import { ApiResponse } from '@nestjs/swagger';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';
import { Public } from 'src/auth/decorator/public.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { HasRoles } from 'src/role/roles.decorator';
import { Throttle } from '@nestjs/throttler';
@Controller('table-booking')
@ApiTags('Table Booking ')
@ApiBearerAuth()
export class TableBookingController {
  constructor(private readonly tableBookingService: TableBookingService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'Table booking created successfully',
    type: TableBookingResponseDto,
  })
  @ApiOperation({ summary: 'Create a new table booking' })
  @ApiResponse({
    status: 200,
    description: 'Create a new table booking successfully',
  })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })
  @Public()
  @Throttle({ default: { limit: 20, ttl: 10000 } })
  async create(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    createTableBookingDto: CreateTableBookingDto,
  ) {
    const result = await this.tableBookingService.create(createTableBookingDto);
    return {
      message: 'Table booking have been created successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<TableBookingResponseDto>;
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Get all table bookings successfully',
    type: TableBookingResponseDto,
    isArray: true,
  })
  @ApiOperation({ summary: 'Get all table bookings' })
  @ApiResponse({
    status: 200,
    description: 'Get all table bookings successfully',
  })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })
  @HasRoles(
    RoleEnum.Manager,
    RoleEnum.Admin,
    RoleEnum.SuperAdmin,
    RoleEnum.Staff,
    RoleEnum.Cashier,
    RoleEnum.Telesale,
  )
  async getAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetTableBookingQueryDto,
  ) {
    const result = await this.tableBookingService.getAll(query);
    return {
      message: 'Table bookings have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<TableBookingResponseDto>>;
  }

  @Get('export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Export table bookings to Excel' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Table bookings have been exported successfully',
    content: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })
  @HasRoles(
    RoleEnum.Manager,
    RoleEnum.Admin,
    RoleEnum.SuperAdmin,
    RoleEnum.Staff,
    RoleEnum.Cashier,
    RoleEnum.Telesale,
  )
  async exportToExcel(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetTableBookingQueryDto,
  ): Promise<StreamableFile> {
    const result = await this.tableBookingService.exportToExcel(query);
    return new StreamableFile(result, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      length: result.length,
      disposition: `attachment; filename="table-booking-${new Date().toISOString()}.xlsx"`,
    });
  }

  @Patch(':slug')
  @HttpCode(HttpStatus.OK)
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Update table booking successfully',
    type: TableBookingResponseDto,
  })
  @ApiOperation({ summary: 'Update table booking' })
  @ApiResponse({
    status: 200,
    description: 'Update table booking successfully',
  })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })
  @HasRoles(
    RoleEnum.Manager,
    RoleEnum.Admin,
    RoleEnum.SuperAdmin,
    RoleEnum.Staff,
    RoleEnum.Cashier,
    RoleEnum.Telesale,
  )
  async update(
    @Param('slug') slug: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
      }),
    )
    updateTableDto: UpdateTableBookingDto,
  ) {
    const result = await this.tableBookingService.update(slug, updateTableDto);
    return {
      message: 'Table have been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<TableBookingResponseDto>;
  }

  // @Delete(':slug')
  // @HasRoles(
  //   RoleEnum.Manager,
  //   RoleEnum.Admin,
  //   RoleEnum.SuperAdmin,
  //   RoleEnum.Staff,
  //   RoleEnum.Cashier,
  //   RoleEnum.Telesale,
  // )
  // @HttpCode(HttpStatus.OK)
  // @ApiOperation({ summary: 'Delete an table booking by slug' })
  // @ApiResponse({
  //   status: HttpStatus.OK,
  //   description: 'The table booking has been deleted successfully',
  // })
  // @ApiResponse({
  //   status: HttpStatus.NOT_FOUND,
  //   description: 'Table booking not found',
  // })
  // @ApiResponse({
  //   status: HttpStatus.BAD_REQUEST,
  //   description: 'Table booking is already deleted',
  // })
  // async remove(@Param('slug') slug: string): Promise<AppResponseDto<void>> {
  //   await this.tableBookingService.remove(slug);
  //   return {
  //     message: 'The table booking has been deleted successfully',
  //     statusCode: HttpStatus.NO_CONTENT,
  //     timestamp: new Date().toISOString(),
  //   } as AppResponseDto<void>;
  // }
}
