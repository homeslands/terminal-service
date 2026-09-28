import {
  Body,
  HttpStatus,
  Inject,
  Logger,
  Query,
  StreamableFile,
  ValidationPipe,
} from '@nestjs/common';
import { CardOrderRevenueService } from './card-order-revenue.service';
import { RestController } from 'src/shared/decorators/rest-controller.decorator';
import { GetAllCardOrderRevenueApi, PostExportExcelCardOrderRevenueApi, PostExportPdfCardOrderRevenueApi } from './card-order-revenue.swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppResponseDto } from 'src/app/app.dto';
import { CardOrderRevenueResponseDto } from './dto/card-order-revenue-response.dto';
import { FindAllCardOrderRevenueDto } from './dto/find-all-card-order-revenue.dto';
import { ExportCardOrderRevenueDto } from './dto/export-card-order-revenue.dto';
import { ExportFilename } from 'src/shared/constants/export-filename.constant';

@RestController({
  path: 'card-order-revenue',
  tags: ['Card Order Revenue Resource'],
})
export class CardOrderRevenueController {
  private readonly BASE_CONTEXT = `${CardOrderRevenueController.name}.`;

  constructor(
    private readonly cardOrderRevenueService: CardOrderRevenueService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
  ) { }

  @GetAllCardOrderRevenueApi({ path: '' })
  async findAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: FindAllCardOrderRevenueDto,
  ) {
    const context = this.BASE_CONTEXT.concat(this.findAll.name);
    this.logger.log(
      `REST request to get all card order revenues with query: ${JSON.stringify(query)}`,
      context,
    );

    const result = await this.cardOrderRevenueService.findAll(query);
    return {
      message: '',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<CardOrderRevenueResponseDto[]>;
  }


  @PostExportExcelCardOrderRevenueApi({ path: '/export/excel' })
  async exportExcel(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    query: ExportCardOrderRevenueDto,
  ): Promise<StreamableFile> {
    const context = this.BASE_CONTEXT.concat(this.exportExcel.name);
    this.logger.log(
      `REST request to export excel card order revenues with query: ${JSON.stringify(query)}`,
      context,
    );
    const result = await this.cardOrderRevenueService.exportExcel(query);

    return new StreamableFile(result.data, {
      type: 'application/vnd.ms-excel',
      length: result.size,
      disposition: `attachment; filename="${result.name}"`,
    });
  }

  @PostExportPdfCardOrderRevenueApi({ path: '/export/pdf' })
  async exportPdf(
    @Body(new ValidationPipe({ transform: true }))
    requestData: ExportCardOrderRevenueDto,
  ): Promise<StreamableFile> {
    const context = this.BASE_CONTEXT.concat(this.exportPdf.name);
    this.logger.log(
      `REST request to export pdf card order revenues with body: ${JSON.stringify(requestData)}`,
      context,
    );
    const result =
      await this.cardOrderRevenueService.exportPdf(requestData);
    return new StreamableFile(result, {
      type: 'application/pdf',
      length: result.length,
      disposition: `attachment; filename="${ExportFilename.EXPORT_CARD_ORDER_REVENUE}.pdf"`,
    });
  }
}
