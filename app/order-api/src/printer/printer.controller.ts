import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrinterEventService } from './printer-event/printer-event.service';
import {
  GetPrinterEventsRequestDto,
  PrinterEventResponseDto,
} from './printer-event/printer-event.dto';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';
import { RoleEnum } from 'src/role/role.enum';
import { HasRoles } from 'src/role/roles.decorator';
@Controller('printer')
@ApiTags('Printer')
@ApiBearerAuth()
export class PrinterController {
  constructor(private readonly printerEventService: PrinterEventService) {}

  @Get('events')
  @HasRoles(
    RoleEnum.Staff,
    RoleEnum.Cashier,
    RoleEnum.Chef,
    RoleEnum.Manager,
    RoleEnum.Admin,
    RoleEnum.SuperAdmin,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retrieve all printer events' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'All printer events have been retrieved successfully',
    type: PrinterEventResponseDto,
    isArray: true,
  })
  async findAllPrinterEvents(
    @Query(new ValidationPipe({ transform: true }))
    query: GetPrinterEventsRequestDto,
  ) {
    const result = await this.printerEventService.findAll(query);
    return {
      message: 'All printer events have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<PrinterEventResponseDto>>;
  }
}
