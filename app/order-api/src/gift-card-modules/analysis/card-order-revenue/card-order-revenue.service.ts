import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Between, FindOptionsWhere, MoreThan, Repository } from 'typeorm';
import { CardOrderRevenue } from './entities/card-order-revenue.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { CardOrderRevenueResponseDto } from './dto/card-order-revenue-response.dto';
import { FindAllCardOrderRevenueDto } from './dto/find-all-card-order-revenue.dto';
import { ExportCardOrderRevenueDto } from './dto/export-card-order-revenue.dto';
import { ExportFilename } from 'src/shared/constants/export-filename.constant';
import { SharedExportFileService } from 'src/shared/services/shared-export-file.service';
import { ExcelConfig } from 'src/shared/interfaces/commons/excel-config.interface';
import { ExcelUtil } from 'src/shared/utils/excel.util';
import { CurrencyUtil } from 'src/shared/utils/currency.util';
import moment from 'moment';
import { PdfService } from 'src/pdf/pdf.service';
import { fileToBase64DataUri } from 'src/shared/utils/file.util';
import { Chart, ChartConfiguration } from 'chart.js';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { formatCurrency } from 'src/helper';
import ChartDataLabels from 'chartjs-plugin-datalabels';

@Injectable()
export class CardOrderRevenueService implements OnModuleInit {

  constructor(
    @InjectRepository(CardOrderRevenue)
    private readonly cardOrderRevenueRepository: Repository<CardOrderRevenue>,
    @InjectMapper()
    private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    private readonly transactionService: TransactionManagerService,
    private readonly sharedExportFileService: SharedExportFileService,
    private readonly pdfService: PdfService
  ) { }

  onModuleInit() {
    Chart.register(ChartDataLabels);
  }

  private buildExcelConfig() {
    const excelConfig = new ExcelConfig();
    const headers = [
      { header: 'STT', key: 'index', width: ExcelUtil.WIDTH_COL_STT },
      {
        header: 'Ngày',
        key: 'date',
        width: ExcelUtil.WIDTH_COL_MEDIUM,
      },
      { header: 'Thứ tự đơn', key: 'orderSequence', width: ExcelUtil.WIDTH_COL_MEDIUM },
      {
        header: 'Tổng tiền',
        key: 'totalRevenue',
        width: ExcelUtil.WIDTH_COL_MEDIUM,
      },
      { header: 'Đơn TT ngân hàng', key: 'totalCardOrdersByBank', width: ExcelUtil.WIDTH_COL_MEDIUM },
      {
        header: 'Tiền TT ngân hàng',
        key: 'bankRevenue',
        width: ExcelUtil.WIDTH_COL_MEDIUM,
      },
      { header: 'Đơn TT tiền mặt', key: 'totalCardOrdersByCash', width: ExcelUtil.WIDTH_COL_MEDIUM },
      {
        header: 'Tổng TT tiền mặt',
        key: 'cashRevenue',
        width: ExcelUtil.WIDTH_COL_MEDIUM,
      },
      { header: 'Thẻ đã bán', key: 'cardCount', width: ExcelUtil.WIDTH_COL_MEDIUM },
      { header: 'Đơn thẻ quà tặng', key: 'totalCardOrders', width: ExcelUtil.WIDTH_COL_MEDIUM },
      { header: 'Đơn nạp cho bản thân', key: 'selfTopupOrderCount', width: ExcelUtil.WIDTH_COL_MEDIUM },
      { header: 'Đơn nạp cho người khác', key: 'giftTopupOrderCount', width: ExcelUtil.WIDTH_COL_MEDIUM },
      { header: 'Đơn mua thẻ quà tặng', key: 'cardPurchaseOrderCount', width: ExcelUtil.WIDTH_COL_MEDIUM },
    ];
    excelConfig.headers = headers;
    return excelConfig;
  }

  buildDateData(date?: Date, type?: string) {
    if (!date) return null
    switch (type) {
      case 'day':
        return moment(date).format('DD/MM/YYYY')
      case 'hour':
        return moment(date).format('HH:mm:ss DD/MM/YYYY')
      default:
        return null;
    }
  }

  private buildData(data: CardOrderRevenue[], type?: string) {
    const exportData = data.map((item, index) => ({
      ...item,
      index: index + 1,
      totalRevenue: CurrencyUtil.formatCurrency(item?.totalRevenue),
      bankRevenue: CurrencyUtil.formatCurrency(item?.bankRevenue),
      cashRevenue: CurrencyUtil.formatCurrency(item?.cashRevenue),
      orderSequence: `${item.minOrderSequence} - ${item.maxOrderSequence}`,
      date: this.buildDateData(item.date, type),
    }));
    return exportData;
  }

  async exportPdf(query: ExportCardOrderRevenueDto) {
    let results: CardOrderRevenue[] = await this._findAll({ fromDate: query.fromDate, toDate: query.toDate, type: query.type });;
    const totalCardOrders = results?.reduce((sum, item) => sum + Number(item.totalCardOrders), 0);
    const totalRevenue = results?.reduce((sum, item) => sum + Number(item.totalRevenue), 0);
    const bankRevenue = results?.reduce((sum, item) => sum + Number(item.bankRevenue), 0);
    const cashRevenue = results?.reduce((sum, item) => sum + Number(item.cashRevenue), 0);
    const cardCount = results?.reduce((sum, item) => sum + Number(item.cardCount), 0);
    const selfTopupOrderCount = results?.reduce((sum, item) => sum + Number(item.selfTopupOrderCount), 0);
    const giftTopupOrderCount = results?.reduce((sum, item) => sum + Number(item.giftTopupOrderCount), 0);
    const cardPurchaseOrderCount = results?.reduce((sum, item) => sum + Number(item.cardPurchaseOrderCount), 0);
    const totalCardOrdersByBank = results?.reduce((sum, item) => sum + Number(item.totalCardOrdersByBank), 0);
    const totalCardOrdersByCash = results?.reduce((sum, item) => sum + Number(item.totalCardOrdersByCash), 0);
    const minOrderSequence = results?.reduce((min, cur) => Number(cur.minOrderSequence) < min ? Number(cur.minOrderSequence) : min, Infinity);
    const maxOrderSequence = results?.reduce((max, cur) => Number(cur.maxOrderSequence) > max ? Number(cur.maxOrderSequence) : max, 0);

    const dates = results.map(item => moment(item.date).format('DD-MM-YYYY HH:mm:ss'));

    const revenues = results.map(item => Number(item.totalRevenue));
    const orders = results.map(item => Number(item.totalCardOrders));

    const values = {
      cardCount,
      minOrderSequence,
      maxOrderSequence,
      createdAt: new Date(),

      totalCardOrdersByBank,
      totalCardOrdersByCash,
      shiftStartTime: query.fromDate,
      shiftEndTime: query.toDate,
      selfTopupOrderCount,
      giftTopupOrderCount,
      cardPurchaseOrderCount,
      totalCardOrders,
      totalRevenue,
      bankRevenue,
      cashRevenue,
      dates,
      revenues,
      orders,
      results
    }

    const logoUri = fileToBase64DataUri('public/images/logo.png', 'image/png');

    const data = await this.pdfService.generatePdf(
      'card-order-revenue',
      { ...values, logoUri },
      {
        // width: 'A4',
      },
    );

    return data;
  }

  async exportExcel(query: ExportCardOrderRevenueDto) {
    let results: CardOrderRevenue[] = await this._findAll({ fromDate: query.fromDate, toDate: query.toDate, type: query.type });;
    const filename = ExportFilename.EXPORT_CARD_ORDER_REVENUE;
    const excelConfig = this.buildExcelConfig();
    const data = this.buildData(results, query.type);

    const totalCardOrders = results?.reduce((sum, item) => sum + Number(item.totalCardOrders), 0);
    const totalRevenue = results?.reduce((sum, item) => sum + Number(item.totalRevenue), 0);
    const bankRevenue = results?.reduce((sum, item) => sum + Number(item.bankRevenue), 0);
    const cashRevenue = results?.reduce((sum, item) => sum + Number(item.cashRevenue), 0);
    const selfTopupOrderCount = results?.reduce((sum, item) => sum + Number(item.selfTopupOrderCount), 0);
    const giftTopupOrderCount = results?.reduce((sum, item) => sum + Number(item.giftTopupOrderCount), 0);
    const cardPurchaseOrderCount = results?.reduce((sum, item) => sum + Number(item.cardPurchaseOrderCount), 0);

    const dates = results.map(item => moment(item.date).format('DD-MM-YYYY HH:mm:ss'));

    const revenues = results.map(item => Number(item.totalRevenue));
    const orders = results.map(item => Number(item.totalCardOrders));

    const images = [];

    const barChartBuff = await this.buildBarChartBuffer({ dates, revenues, orders });

    const pieChart1Buff = await this.buildPieChart1Buffer({ cashRevenue, bankRevenue, totalRevenue });

    const pieChart2Buff = await this.buildPieChart2Buffer({ selfTopupOrderCount, giftTopupOrderCount, cardPurchaseOrderCount, totalCardOrders });

    images.push({
      name: 'bar-chart',
      buffer: barChartBuff,
      extension: 'png'
    });

    images.push({
      name: 'pie-chart-1',
      buffer: pieChart1Buff,
      extension: 'png'
    });

    images.push({
      name: 'pie-chart-2',
      buffer: pieChart2Buff,
      extension: 'png'
    });

    return await this.sharedExportFileService.exportExcelWithImages(
      filename,
      excelConfig,
      data,
      images
    );
  }

  async buildPieChart1Buffer(params: { cashRevenue: number, bankRevenue: number, totalRevenue: number }) {
    const { cashRevenue, bankRevenue, totalRevenue } = params;

    const chartJSNodeCanvas = new ChartJSNodeCanvas({
      width: 1000,
      height: 500,
      backgroundColour: 'white',
    });
    const cashRevenuePercentage = totalRevenue > 0 ? (cashRevenue / totalRevenue * 100).toFixed(1) + '%' : '0%';
    const bankRevenuePercentage = totalRevenue > 0 ? (bankRevenue / totalRevenue * 100).toFixed(1) + '%' : '0%';


    const config: ChartConfiguration<'pie'> = {
      type: 'pie',
      data: {
        labels: [
          `Tiền mặt: ${CurrencyUtil.formatCurrency(cashRevenue)} (${cashRevenuePercentage})`,
          `chuyển khoản: ${CurrencyUtil.formatCurrency(bankRevenue)} (${bankRevenuePercentage})`
        ],
        datasets: [{
          data: [cashRevenue || 0, bankRevenue || 0],
          backgroundColor: ['#ef4444', '#3b82f6']
        }]
      },
    }
    return await chartJSNodeCanvas.renderToBuffer(config);
  }

  async buildPieChart2Buffer(params: { selfTopupOrderCount: number, giftTopupOrderCount: number, cardPurchaseOrderCount: number, totalCardOrders: number }) {
    const { selfTopupOrderCount, giftTopupOrderCount, cardPurchaseOrderCount, totalCardOrders } = params;

    const chartJSNodeCanvas = new ChartJSNodeCanvas({
      width: 1000,
      height: 500,
      backgroundColour: 'white',
    });

    const selfTopupOrderPer = totalCardOrders > 0 ? (selfTopupOrderCount / totalCardOrders * 100).toFixed(1) + '%' : '0%';
    const giftTopupOrderPer = totalCardOrders > 0 ? (giftTopupOrderCount / totalCardOrders * 100).toFixed(1) + '%' : '0%';
    const cardPurchaseOrderPer = totalCardOrders > 0 ? (cardPurchaseOrderCount / totalCardOrders * 100).toFixed(1) + '%' : '0%';

    const config: ChartConfiguration<'pie'> = {
      type: 'pie',
      data: {
        labels: [
          `Nạp cho bản thân: ${selfTopupOrderCount} đơn (${selfTopupOrderPer})`,
          `Nạp cho người khác: ${giftTopupOrderCount} đơn (${giftTopupOrderPer})`,
          `Mua thẻ quà tặng: ${cardPurchaseOrderCount} đơn (${cardPurchaseOrderPer})`
        ],
        datasets: [{
          data: [selfTopupOrderCount, giftTopupOrderCount, cardPurchaseOrderCount],
          backgroundColor: ["#4CAF50", "#2196F3", "#FF9800"]
        }]
      },
      options: {
        plugins: {
          datalabels: {
            color: '#fff',
            font: {
              weight: 'bold',
              size: 14
            },
            formatter: (value: number) => {

              const percentage = (value / totalCardOrders * 100).toFixed(1) + '%';
              return `${value} đơn (${percentage})`;
            }
          },
        },
      },
    }
    return await chartJSNodeCanvas.renderToBuffer(config);
  }

  async buildBarChartBuffer(params: { dates: string[], revenues: number[], orders: number[] }) {
    const { dates, revenues, orders } = params;
    const width = 1000;
    const height = 500;

    const chartJSNodeCanvas = new ChartJSNodeCanvas({
      width,
      height,
      backgroundColour: 'white'
    });

    const configuration: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: dates,
        datasets: [
          {
            label: "Doanh thu",
            data: revenues,
            type: 'line',
            yAxisID: 'yRevenue',
            tension: 0.3
          },
          {
            label: 'Đơn hàng',
            data: orders,
            type: 'bar',
            yAxisID: 'yOrders'
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Doanh thu & đơn hàng theo thời gian'
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.dataset.yAxisID === 'yRevenue') {
                  return `Doanh thu: ${formatCurrency(+ctx.raw)}`;
                }
                return `Đơn hàng: ${ctx.raw}`;
              }
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Ngày'
            },
            ticks: {
              maxRotation: 90,
              minRotation: 45
            }
          },
          yRevenue: {
            type: 'linear',
            position: 'left',
            // normalized: false,
            title: {
              display: true,
              text: 'Doanh thu (VND)'
            },
            // ticks: {
            //   callback: value => formatVND(value)
            // }
          },
          yOrders: {
            type: 'linear',
            position: 'right',
            title: {
              display: true,
              text: 'Đơn hàng'
            },
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    }

    return await chartJSNodeCanvas.renderToBuffer(configuration);
  }

  private buildFindAllWhereOpts(query: FindAllCardOrderRevenueDto) {
    const whereOpts: FindOptionsWhere<CardOrderRevenue> = {}

    if (query.fromDate && !query.toDate) {
      whereOpts.date = MoreThan(query.fromDate);
    }

    if (query.fromDate && query.toDate) {
      whereOpts.date = Between(query.fromDate, query.toDate);
    }
    return whereOpts;
  }


  private async _findAll(query: FindAllCardOrderRevenueDto) {
    if (query.type === 'hour') {
      const queryStr = `
          SELECT
                DATE_FORMAT(created_at_column, '%Y-%m-%d %H:00:00') AS date,

                COUNT(*) AS totalCardOrders,

                MIN(sequence_column) AS minOrderSequence,
    
                MAX(sequence_column) AS maxOrderSequence,
                
                COALESCE(
                    SUM((payment_method_column = 'bank-transfer')),
                    0
                ) AS totalCardOrdersByBank,
                
                COALESCE(
                    SUM((payment_method_column = 'cash')),
                    0
                ) AS totalCardOrdersByCash,

                COALESCE(SUM(total_amount_column), 0) AS totalRevenue,

                COALESCE(
                    SUM(total_amount_column * (payment_method_column = 'bank-transfer')),
                    0
                ) AS bankRevenue,

                COALESCE(
                    SUM(total_amount_column * (payment_method_column = 'cash')),
                    0
                ) AS cashRevenue,

                COALESCE(
                    SUM(quantity_column * (type_column = 'BUY')),
                    0
                ) AS cardCount,

                SUM(type_column = 'SELF') AS selfTopupOrderCount,
                SUM(type_column = 'GIFT') AS giftTopupOrderCount,
                SUM(type_column = 'BUY')  AS cardPurchaseOrderCount
            FROM card_order_tbl
            WHERE status_column = 'completed' AND created_at_column >= ? AND created_at_column <= ?
            GROUP BY date
            ORDER BY date ASC
      `
      const results: CardOrderRevenue[] = await this.cardOrderRevenueRepository.query(queryStr,
        [moment(query.fromDate).format('YYYY-MM-DD HH:mm:ss'), moment(query.toDate).format('YYYY-MM-DD HH:mm:ss')])

      // console.log({ results })
      return results;
    }

    const whereOpts = this.buildFindAllWhereOpts(query);
    const results = await this.cardOrderRevenueRepository.find({
      select: {
        slug: true,
        date: true,
        totalCardOrders: true,
        totalRevenue: true,
        bankRevenue: true,
        cashRevenue: true,
        cardCount: true,
        selfTopupOrderCount: true,
        giftTopupOrderCount: true,
        cardPurchaseOrderCount: true,
        maxOrderSequence: true,
        minOrderSequence: true,
        totalCardOrdersByBank: true,
        totalCardOrdersByCash: true,
        createdAt: true,
      },
      order: {
        date: 'DESC'
      },
      where: whereOpts
    });
    return results;
  }

  async findAll(query: FindAllCardOrderRevenueDto) {
    const results = await this._findAll(query);

    return this.mapper.mapArray(
      results,
      CardOrderRevenue,
      CardOrderRevenueResponseDto,
    );
  }
}
