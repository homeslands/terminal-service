import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PrinterConnectorService } from './printer-connector.service';
import {
  CreatePrinterConnectorDto,
  UpdatePrinterConnectorDto,
  PrinterConnectorResponseDto,
} from './printer-connector.dto';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { AppResponseDto } from 'src/app/app.dto';
import { HasRoles } from 'src/role/roles.decorator';
import { RoleEnum } from 'src/role/role.enum';

@Controller('printer-connector')
@ApiBearerAuth()
@ApiTags('Printer Connector')
export class PrinterConnectorController {
  constructor(
    private readonly printerConnectorService: PrinterConnectorService,
  ) {}

  @HttpCode(HttpStatus.CREATED)
  @Post()
  @HasRoles(RoleEnum.SuperAdmin, RoleEnum.Admin)
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'Printer connector config created successfully',
    type: PrinterConnectorResponseDto,
  })
  @ApiOperation({ summary: 'Create printer connector config for a branch' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })
  async create(
    @Body(new ValidationPipe({ transform: true }))
    createDto: CreatePrinterConnectorDto,
  ) {
    const result = await this.printerConnectorService.create(createDto);
    return {
      message: 'Printer connector config has been created successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<PrinterConnectorResponseDto>;
  }

  @Get('branch/:branchSlug')
  @HttpCode(HttpStatus.OK)
  @HasRoles(RoleEnum.SuperAdmin, RoleEnum.Admin)
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Printer connector config retrieved successfully',
    type: PrinterConnectorResponseDto,
  })
  @ApiOperation({ summary: 'Get printer connector config by branch' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })
  async findByBranch(@Param('branchSlug') branchSlug: string) {
    const result = await this.printerConnectorService.findByBranch(branchSlug);
    return {
      message: 'Printer connector config has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<PrinterConnectorResponseDto>;
  }

  @Patch(':slug')
  @HttpCode(HttpStatus.OK)
  @HasRoles(RoleEnum.SuperAdmin, RoleEnum.Admin)
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Printer connector config updated successfully',
    type: PrinterConnectorResponseDto,
  })
  @ApiOperation({ summary: 'Update printer connector config' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })
  async update(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true }))
    updateDto: UpdatePrinterConnectorDto,
  ) {
    const result = await this.printerConnectorService.update(slug, updateDto);
    return {
      message: 'Printer connector config has been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<PrinterConnectorResponseDto>;
  }

  @Delete(':slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  @HasRoles(RoleEnum.SuperAdmin, RoleEnum.Admin)
  @ApiOperation({ summary: 'Delete printer connector config' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })
  async remove(@Param('slug') slug: string) {
    await this.printerConnectorService.remove(slug);
    return {
      message: 'Printer connector config has been deleted successfully',
      statusCode: HttpStatus.NO_CONTENT,
      timestamp: new Date().toISOString(),
    } as AppResponseDto<void>;
  }
}
