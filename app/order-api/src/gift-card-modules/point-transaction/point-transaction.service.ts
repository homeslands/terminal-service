import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PointTransaction } from './entities/point-transaction.entity';
import { Repository } from 'typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { AnalysisPointTransactionResponseDto, PointTransactionResponseDto } from './dto/point-transaction-response.dto';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { PointTransactionException } from './point-transaction.exception';
import { PointTransactionValidation } from './point-transaction.validation';
import { FindAllPointTransactionDto } from './dto/find-all-point-transaction.dto';
import { CreatePointTransactionDto } from './dto/create-point-transaction.dto';
import {
  PointTransactionObjectTypeEnum,
  PointTransactionTypeEnum,
} from './entities/point-transaction.enum';
import { Order } from 'src/order/order.entity';
import { GiftCard } from '../gift-card/entities/gift-card.entity';
import { PdfService } from 'src/pdf/pdf.service';
import { fileToBase64DataUri } from 'src/shared/utils/file.util';
import {
  ExportAllPointTransactionDto,
  ExportAllSystemPointTransactionDto,
} from './dto/export-all-point-transaction.dto';
import { AuthException } from 'src/auth/auth.exception';
import { AuthValidation } from 'src/auth/auth.validation';
import { CardOrder } from '../card-order/entities/card-order.entity';
import { SharedPointTransactionService } from 'src/shared/services/shared-point-transaction.service';
import { SharedUserRefService } from 'src/shared/services/shared-user-ref.service';
import {
  assignNestedUserFlags,
  batchLookupSharedUserIdentities,
} from 'src/user/user.helper';
import { SharedUserServiceClient } from 'src/external-services/shared-user-service/shared-user-service.client';
import { CreatePointTransactionPayload } from 'src/shared/interfaces/commons/shared-point-transaction.interface';
import _ from 'lodash';
import { SharedExportFileService } from 'src/shared/services/shared-export-file.service';
import { ExcelConfig } from 'src/shared/interfaces/commons/excel-config.interface';
import { ExcelUtil } from 'src/shared/utils/excel.util';
import moment from 'moment';
import { ExportFilename } from 'src/shared/constants/export-filename.constant';
import { CurrencyUtil } from 'src/shared/utils/currency.util';

// Buoc 7.7d (QD17): mot dong giao dich xu cua nhom "xem ho" tra ve tu
// `/internal/point-transactions/*` o shared-user - field cu cua
// `PointTransactionResponseDto` + `service` (service da ghi dong, QD-T5) +
// `balance` (so du sau giao dich, chi dong cua `/export` co).
type PointTransactionViewRow = PointTransactionResponseDto & {
  service?: string | null;
  balance?: number;
};

interface PointTransactionViewRows {
  items: PointTransactionViewRow[];
  total: number;
}

// Ngay cua bo loc gui sang shared-user: chuoi `YYYY-MM-DD`. DTO cua route da
// doi chuoi do sang `Date` theo gio may (`startOf/endOf('day')`); gui `Date`
// di thi no thanh chuoi ISO UTC, shared-user parse lai bang
// `moment(value, 'YYYY-MM-DD')` => lech mot ngay o mui gio duong.
const toWireDate = (date?: Date): string | undefined =>
  date ? moment(date).format('YYYY-MM-DD') : undefined;

@Injectable()
export class PointTransactionService {

  constructor(
    @InjectRepository(CardOrder)
    private coRepository: Repository<CardOrder>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(GiftCard)
    private gcRepository: Repository<GiftCard>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    @InjectMapper()
    private readonly mapper: Mapper,
    private readonly pdfService: PdfService,
    private readonly sharedPtService: SharedPointTransactionService,
    // Buoc 2.13 — dich `userSlug` cua DTO client-facing sang `sharedUserId`
    // ngay tai bien gioi. Xem ghi chu trong `create`.
    private readonly sharedUserRefService: SharedUserRefService,
    private readonly sharedExportFileService: SharedExportFileService,
    // Buoc 3.4 - `user.isActive` lay tu shared-user; buoc 7.7d - nhom "xem
    // ho" doc giao dich xu o shared-user (`/internal/point-transactions/*`).
    private readonly sharedUserServiceClient: SharedUserServiceClient,
  ) { }

  // Buoc 7.7d (QD17): tong nhan / tieu cua giao dich xu, doc
  // `/internal/point-transactions/analysis` (route da gac role). Giu dung ba
  // field terminal-ui doc; `statistics` cua shared-user bo qua (QD-T5).
  async analyze(req: FindAllPointTransactionDto) {
    const { totalEarned, totalSpent, netDifference } =
      await this.sharedUserServiceClient.analyzePointTransactions<AnalysisPointTransactionResponseDto>(
        await this.toViewFilter(req),
      );
    const result = new AnalysisPointTransactionResponseDto();

    Object.assign(result, {
      totalEarned,
      totalSpent,
      netDifference,
    });
    return result;
  }

  // Bo loc cua `/internal/point-transactions/query|analysis` tu query cu cua
  // man hinh. `userSlug` (slug cuc bo) => `sharedUserId` ngay tai bien (slug
  // sai => 400/137000); khong co `userSlug` => moi giao dich do CHINH service
  // nay ghi (QD-T5). `k` (ten / SDT) shared-user tu khop tren bang user cua no
  // va trai bo loc nguoi vao ca hai nhanh - het BE-17, het doc cot ten cuc bo.
  private async toViewFilter(req: FindAllPointTransactionDto) {
    return {
      userId: req.userSlug
        ? await this.sharedUserRefService.toSharedUserId(req.userSlug)
        : undefined,
      type: req.type || undefined,
      // Man terminal goi `fromDate` / `toDate`; shared-user goi
      // `startDate` / `endDate`. Khong co `groupBy` (shared-user mac dinh
      // ngay; `statistics` bi bo o duoi).
      startDate: toWireDate(req.fromDate),
      endDate: toWireDate(req.toDate),
      k: req.k || undefined,
      page: req.page,
      size: req.size,
      sort: req.sort,
    };
  }

  // Mot giao dich theo slug, chi trong cac giao dich do CHINH service nay ghi
  // (khong gui `userId` => pham vi service, QD-T5): tham chieu mem cua dong
  // (`objectSlug`) chi tra duoc o service da ghi no. Slug rong KHONG duoc gui
  // di - thieu `slug` thi shared-user tra MOI dong cua service, dong dau la
  // giao dich cua mot nguoi la.
  private async findViewRowBySlug(
    slug: string,
  ): Promise<PointTransactionViewRow> {
    if (!slug) {
      throw new PointTransactionException(
        PointTransactionValidation.POINT_TRANSACTION_NOT_FOUND,
      );
    }
    const { items } =
      await this.sharedUserServiceClient.exportPointTransactions<PointTransactionViewRows>(
        { slug },
      );
    if (!items?.length) {
      throw new PointTransactionException(
        PointTransactionValidation.POINT_TRANSACTION_NOT_FOUND,
      );
    }
    return items[0];
  }

  // Buoc 7.7d (QD17): file Excel giao dich xu toan he thong = moi giao dich do
  // service nay ghi (QD-T5), lay o shared-user (cu nhat truoc; qua tran so dong
  // => 400 kem cau "thu hep bo loc" cua shared-user, khong cat bot).
  async exportAllSystem(query: ExportAllSystemPointTransactionDto) {
    const context = `${PointTransactionService.name}.${this.export.name}`;
    this.logger.log(
      `Export all point transaction req: ${JSON.stringify(query)}`,
      context,
    );

    const { items: pts } =
      await this.sharedUserServiceClient.exportPointTransactions<PointTransactionViewRows>(
        {
          type: query.type || undefined,
          fromDate: toWireDate(query.fromDate),
          toDate: toWireDate(query.toDate),
        },
      );

    const filename = ExportFilename.EXPORT_ALL_SYSTEM_POINT_TRANSACTION;
    const excelConfig = this.buildExcelConfig();
    const data = this.buildData(pts);

    return await this.sharedExportFileService.exportExcel(
      filename,
      excelConfig,
      data,
    );
  }

  private buildExcelConfig() {
    const excelConfig = new ExcelConfig();
    const headers = [
      { header: 'STT', key: 'index', width: ExcelUtil.WIDTH_COL_STT },
      {
        header: 'Khách hàng',
        key: 'customerName',
        width: ExcelUtil.WIDTH_COL_MEDIUM,
      },
      {
        header: 'Số diện thoại',
        key: 'phonenumber',
        width: ExcelUtil.WIDTH_COL_MEDIUM,
      },
      {
        header: 'Loại giao dịch',
        key: 'type',
        width: ExcelUtil.WIDTH_COL_CODE,
      },
      { header: 'Số xu', key: 'points', width: ExcelUtil.WIDTH_COL_SHORT },
      { header: 'Mô tả', key: 'desc', width: ExcelUtil.WIDTH_COL_LONG },
      {
        header: 'Ngày tạo',
        key: 'createdAt',
        width: ExcelUtil.WIDTH_COL_SHORT,
      },
    ];
    excelConfig.headers = headers;
    return excelConfig;
  }

  private buildData(data: any[]) {
    const exportData = data.map((item, index) => ({
      ...item,
      index: index + 1,
      customerName: `${item?.user?.firstName} ${item?.user?.lastName}`,
      phonenumber: item?.user?.phonenumber,
      type: item?.type === PointTransactionTypeEnum.IN ? 'Nhận xu' : 'Dùng xu',
      points: CurrencyUtil.formatCurrency(item?.points),
      createdAt: item.createdAt
        ? moment(item.createdAt).format('HH:mm:ss DD/MM/YYYY')
        : null,
    }));
    return exportData;
  }

  // Buoc 7.7d (QD17): file PDF lich su xu cua MOT khach. Dong giao dich lay o
  // shared-user (`/internal/point-transactions/export` co `userId`: moi dong
  // cua vi nguoi do, ke ca dong service khac ghi - mot vi moi nguoi, QD-T5).
  // Ten / dia chi / SDT o dau file lay tu identity shared-user, khong doc cot
  // identity cuc bo (drop o giai doan 8).
  async exportAll(query: ExportAllPointTransactionDto) {
    const context = `${PointTransactionService.name}.${this.export.name}`;
    this.logger.log(
      `Export all point transaction req: ${JSON.stringify(query)}`,
      context,
    );

    const sharedUserId = await this.sharedUserRefService.toSharedUserId(
      query.userSlug,
    );
    const user = await this.sharedUserServiceClient.lookupById(sharedUserId);
    if (!user) throw new AuthException(AuthValidation.USER_NOT_FOUND);

    const { items: pts } =
      await this.sharedUserServiceClient.exportPointTransactions<PointTransactionViewRows>(
        {
          userId: sharedUserId,
          type: query.type || undefined,
          fromDate: toWireDate(query.fromDate),
          toDate: toWireDate(query.toDate),
        },
      );

    const totalIn = pts
      .filter((item) => item.type === PointTransactionTypeEnum.IN)
      .reduce((prev, cur) => prev + cur.points, 0);
    const totalOut = pts
      .filter((item) => item.type === PointTransactionTypeEnum.OUT)
      .reduce((prev, cur) => prev + cur.points, 0);
    let totalPoints = 0;

    if (!_.isEmpty(pts)) {
      const lastItem = pts.at(pts.length - 1);
      if (lastItem.type === PointTransactionTypeEnum.IN)
        totalPoints = +lastItem.balance + lastItem.points;
      else totalPoints = +lastItem.balance - lastItem.points;
    }

    const logoUri = fileToBase64DataUri('public/images/logo.png', 'image/png');
    const exportAt = new Date();

    return await this.pdfService.generatePdf(
      'point-transactions',
      {
        logoUri,
        pts,
        exportAt,
        user,
        query,
        totalIn,
        totalOut,
        totalPoints,
      },
      {
        format: 'A4',
      },
    );
  }

  // Bien nhan MOT giao dich: dong lay o shared-user theo slug (trong pham vi
  // giao dich service nay ghi), doi tuong tham chieu (`ref`) van tra o DB cua
  // service nay - chi no biet don / the cua minh.
  async export(slug: string) {
    const context = `${PointTransactionService.name}.${this.export.name}`;
    this.logger.log(`Export point transaction req: ${slug}`, context);

    const pt = await this.findViewRowBySlug(slug);

    const ref: Order | GiftCard | CardOrder = await this.getObjectRef({
      objectType: pt.objectType,
      objectSlug: pt.objectSlug,
    });

    const logoUri = fileToBase64DataUri('public/images/logo.png', 'image/png');

    return await this.pdfService.generatePdf(
      'point-transaction',
      {
        logoUri,
        ref,
        ...pt,
      },
      {
        width: '80mm',
      },
    );
  }

  async getObjectRef(payload: { objectType: string; objectSlug: string }) {
    let objectRef: Order | GiftCard | CardOrder = null;

    switch (payload.objectType) {
      case PointTransactionObjectTypeEnum.ORDER:
        objectRef = await this.orderRepository.findOne({
          where: { slug: payload.objectSlug },
        });
        break;
      case PointTransactionObjectTypeEnum.GIFT_CARD:
        objectRef = await this.gcRepository.findOne({
          where: { slug: payload.objectSlug },
          relations: ['cardOrder'],
        });
        break;
      case PointTransactionObjectTypeEnum.CARD_ORDER:
        objectRef = await this.coRepository.findOne({
          where: { slug: payload.objectSlug },
          relations: ['payment'],
        });
        break;
      default:
        throw new PointTransactionException(
          PointTransactionValidation.OBJECT_TYPE_NOT_FOUND,
        );
    }
    return objectRef;
  }

  async create(req: CreatePointTransactionDto) {
    // Day la BIEN GIOI client-facing (body cua `POST /point-transaction`):
    // `req.userSlug` phai giu nguyen theo muc 1.4, nhung service dung chung
    // xung ten bang `sharedUserId` tu buoc 2.13. Dich o dung day - mot cho,
    // ngay sat bien - thay vi de khoa slug di sau vao cum vi.
    //
    // Dich hong thi phai ra DUNG ma cu: truoc 2.13 `userSlug` la di thang toi
    // `findOne({ slug })` trong service dung chung roi nem `USER_NOT_FOUND`
    // => **400 / 158508**. De helper nem `Error` tran thi route tra **500** —
    // do song 04/11/2026 thay dung nhu vay.
    //
    // Doi 09/11/2026 (nguoi dung chot): gia tri khong hop le thi helper **nem
    // thang**, khong ai phai `try/catch` va cung khong dung lop loi rieng -
    // `toSharedUserId` nem `UserException(UserValidation.USER_NOT_FOUND)`, tuc
    // **400 / 137000**, ma san co cua module `user`.
    //
    // ⚠ Hop dong route doi: ma cu cua duong nay la **158508**
    // (`PointTransactionValidation.USER_NOT_FOUND`), nay la **137000**. Van la
    // HTTP 400 va cung cau "User not found"; khac la **137000 CO ban dich o ca
    // hai UI** (`toast.userNotFound`) con 158508 thi khong. Doi co chu dich,
    // ghi o than buoc 2.13 (muc 1.4 doi tuong minh, khong am tham).
    //
    // Hai duong hong con lai cua helper (slug rong, thieu `sharedUserId`) nay
    // cung ra 400 / 137000 kem log muc `error` - chung thuong la loi lap trinh,
    // nhung mot `Error` tran thi khong ai bat, chi thanh 500 khong ma loi.
    const { userSlug, ...rest } = req;
    const sharedUserId = await this.sharedUserRefService.toSharedUserId(userSlug);
    // Buoc 3.4 - tra `isActive` TRUOC khi ghi: shared-user hong thi 503 ngay
    // day, khi chua ghi gi. Tra SAU khi ghi thi client nhan 503 cho mot giao
    // dich DA tao - goi lai la cong diem hai lan.
    const userIdentityById = await batchLookupSharedUserIdentities(
      [sharedUserId],
      this.sharedUserServiceClient,
      this.logger,
      `${PointTransactionService.name}.${this.create.name}`,
    );
    const pt = await this.sharedPtService.create({
      ...rest,
      sharedUserId,
    } satisfies CreatePointTransactionPayload);
    const response = this.mapper.map(
      pt,
      PointTransaction,
      PointTransactionResponseDto,
    );
    assignNestedUserFlags([[pt.user, response.user]], userIdentityById);
    return response;
    // const context = `${PointTransaction.name}.${this.create.name}`;
    // this.logger.log(
    //   `Create point transaction req; ${JSON.stringify(req)}`,
    //   context,
    // );

    // const payload = this.mapper.map(
    //   req,
    //   CreatePointTransactionDto,
    //   PointTransaction,
    // );

    // if (
    //   payload.type === PointTransactionTypeEnum.IN &&
    //   payload.objectType === PointTransactionObjectTypeEnum.ORDER
    // ) {
    //   throw new PointTransactionException(
    //     PointTransactionValidation.INVALID_IN_ORDER_TRANSACTION,
    //   );
    // }

    // if (
    //   payload.type === PointTransactionTypeEnum.OUT &&
    //   payload.objectType === PointTransactionObjectTypeEnum.GIFT_CARD
    // ) {
    //   throw new PointTransactionException(
    //     PointTransactionValidation.INVALID_OUT_ORDER_TRANSACTION,
    //   );
    // }

    // if (
    //   payload.type === PointTransactionTypeEnum.OUT &&
    //   payload.objectType === PointTransactionObjectTypeEnum.CARD_ORDER
    // ) {
    //   throw new PointTransactionException(
    //     PointTransactionValidation.INVALID_OUT_CARD_ORDER_TRANSACTION,
    //   );
    // }

    // let objectRef: Order | GiftCard | CardOrder = null;

    // switch (payload.objectType) {
    //   case PointTransactionObjectTypeEnum.ORDER:
    //     objectRef = await this.orderRepository.findOne({
    //       where: { slug: payload.objectSlug },
    //     });
    //     break;
    //   case PointTransactionObjectTypeEnum.GIFT_CARD:
    //     objectRef = await this.gcRepository.findOne({
    //       where: { slug: payload.objectSlug },
    //     });
    //     break;
    //   case PointTransactionObjectTypeEnum.CARD_ORDER:
    //     objectRef = await this.coRepository.findOne({
    //       where: { slug: payload.objectSlug },
    //     });
    //     break;
    //   default:
    //     throw new PointTransactionException(
    //       PointTransactionValidation.OBJECT_TYPE_NOT_FOUND,
    //     );
    // }

    // if (!objectRef)
    //   throw new PointTransactionException(
    //     PointTransactionValidation.OBJECT_TYPE_NOT_FOUND,
    //   );

    // const user = await this.userRepository.findOne({
    //   where: {
    //     slug: payload.userSlug,
    //   },
    // });

    // if (!user)
    //   throw new PointTransactionException(
    //     PointTransactionValidation.USER_NOT_FOUND,
    //   );

    // Object.assign(payload, {
    //   objectId: objectRef.id,
    //   userId: user.id,
    //   user: user,
    // } as Partial<PointTransaction>);

    // const pt = await this.transactionService.execute<PointTransaction>(
    //   async (manager) => {
    //     return manager.save(payload);
    //   },
    //   (res) =>
    //     this.logger.log(
    //       `Point transaction created: ${JSON.stringify(res)}`,
    //       context,
    //     ),
    //   (err) => {
    //     this.logger.error(
    //       `Error when creating point transaction: ${err.message}`,
    //       err.stack,
    //       context,
    //     );
    //     throw new PointTransactionException(
    //       PointTransactionValidation.ERROR_WHEN_CREATE_POINT_TRANSACTION,
    //     );
    //   },
    // );
    // return this.mapper.map(pt, PointTransaction, PointTransactionResponseDto);
  }

  // Buoc 7.7d (QD17): danh sach giao dich xu "xem ho" (mot khach khi co
  // `userSlug`, khong thi toan bo giao dich cua service nay), doc
  // `/internal/point-transactions/query`. Dong mang them `service` (QD-T5);
  // `user` la identity cua shared-user (co san `isActive`).
  async findAll(req: FindAllPointTransactionDto) {
    const context = `${PointTransactionService.name}.${this.findAll.name}`;
    this.logger.log(
      `Find all point transaction: ${JSON.stringify(req)}`,
      context,
    );

    const page = await this.sharedUserServiceClient.queryPointTransactions<
      AppPaginatedResponseDto<PointTransactionViewRow> & {
        statistics?: unknown;
      }
    >(await this.toViewFilter(req));
    // Shape cu cua terminal khong co `statistics` (QD-T5: terminal bo qua).
    return _.omit(
      page,
      'statistics',
    ) as AppPaginatedResponseDto<PointTransactionViewRow>;
  }

  // Route xoa o 7.9 (nhanh tu xem). Toi luc do doc shared-user nhu bien nhan.
  async findOne(slug: string) {
    const context = `${PointTransactionService.name}.${this.findOne.name}`;
    this.logger.log(`Find point transaction: ${JSON.stringify(slug)}`, context);

    return await this.findViewRowBySlug(slug);
  }
}
