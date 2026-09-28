import {
  Get,
  Param,
  HttpCode,
  HttpStatus,
  Query,
  ValidationPipe,
  Post,
  Body,
  StreamableFile,
  Logger,
  Inject,
} from '@nestjs/common';
import { PointTransactionService } from './point-transaction.service';
import { ApiOperation } from '@nestjs/swagger';
import { ApiResponseWithType } from 'src/app/app.decorator';
import {
  AnalysisPointTransactionResponseDto,
  PointTransactionResponseDto,
} from './dto/point-transaction-response.dto';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';
import { FindAllPointTransactionDto } from './dto/find-all-point-transaction.dto';
import { CreatePointTransactionDto } from './dto/create-point-transaction.dto';
import {
  ExportAllPointTransactionDto,
  ExportAllSystemPointTransactionDto,
} from './dto/export-all-point-transaction.dto';
import { ExportFilename } from 'src/shared/constants/export-filename.constant';
import { GetAnalyzePointTransactionApi } from './point-transaction.swagger';
import { RestController } from 'src/shared/decorators/rest-controller.decorator';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

@RestController({
  path: 'point-transaction',
  tags: ['Point Transaction Resources'],
})
export class PointTransactionController {
  constructor(
    private readonly pointTransactionService: PointTransactionService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
  ) { }

  @Get(':slug/export')
  @ApiOperation({ summary: 'Export point transaction' })
  @HttpCode(HttpStatus.OK)
  async export(@Param('slug') slug: string): Promise<StreamableFile> {
    const result = await this.pointTransactionService.export(slug);
    const filename = ExportFilename.EXPORT_POINT_TRANSACTION;

    return new StreamableFile(result, {
      type: 'application/pdf',
      length: result.length,
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get('/export')
  @ApiOperation({ summary: 'Export all point transaction by user' })
  @HttpCode(HttpStatus.OK)
  async exportAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ExportAllPointTransactionDto,
  ): Promise<StreamableFile> {
    const result = await this.pointTransactionService.exportAll(query);
    const filename = ExportFilename.EXPORT_ALL_POINT_TRANSACTIONS;

    return new StreamableFile(result, {
      type: 'application/pdf',
      length: result.length,
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get('/export/system')
  @ApiOperation({ summary: 'Export all system point transactions' })
  @HttpCode(HttpStatus.OK)
  async exportAllSystem(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ExportAllSystemPointTransactionDto,
  ): Promise<StreamableFile> {
    const result = await this.pointTransactionService.exportAllSystem(query);

    return new StreamableFile(result.data, {
      type: 'application/vnd.ms-excel',
      length: result.size,
      disposition: `attachment; filename="${result.name}"`,
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create the point transaction' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    type: PointTransactionResponseDto,
  })
  async create(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    req: CreatePointTransactionDto,
  ) {
    const result = await this.pointTransactionService.create(req);
    return {
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<PointTransactionResponseDto>;
  }

  @GetAnalyzePointTransactionApi({ path: 'analysis' })
  async analyze(
    @Query(new ValidationPipe({ whitelist: true, transform: true }))
    req: FindAllPointTransactionDto,
  ) {
    const context = `${PointTransactionController.name}.${this.analyze.name}`;
    this.logger.log(
      `REST request to analyze point transactions: ${JSON.stringify(req)}`,
      context,
    );

    const result = await this.pointTransactionService.analyze(req);
    return {
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AnalysisPointTransactionResponseDto>;
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retrieve the point transactions' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    type: PointTransactionResponseDto,
    isArray: true,
  })
  async findAll(
    @Query(new ValidationPipe({ whitelist: true, transform: true }))
    req: FindAllPointTransactionDto,
  ) {
    const result = await this.pointTransactionService.findAll(req);
    return {
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<PointTransactionResponseDto>>;
  }

  @Get(':slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retrieve the point transaction' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    type: PointTransactionResponseDto,
  })
  async findOne(@Param('slug') slug: string) {
    const result = await this.pointTransactionService.findOne(slug);
    return {
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<PointTransactionResponseDto>;
  }
}
