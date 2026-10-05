import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { InjectRepository } from '@nestjs/typeorm';
import { TableBookingEntity } from './table-booking.entity';
import {
  Between,
  In,
  Like,
  LessThanOrEqual,
  MoreThanOrEqual,
  Raw,
  Repository,
} from 'typeorm';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import {
  CreateTableBookingDto,
  GetTableBookingQueryDto,
  TableBookingResponseDto,
  UpdateTableBookingDto,
} from './table-booking.dto';
import { getRandomString } from 'src/helper';
import {
  BOOKING_DAY_FORMAT,
  getBookingDayRange,
  parseBookingDate,
} from './table-booking.validation';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { FindOptionsWhere, FindManyOptions } from 'typeorm';
import { BookingStatus } from './table-booking.constants';
import { NotificationUtils } from 'src/notification/notification.utils';
import { MailService } from 'src/mail/mail.service';
import { SystemConfigService } from 'src/system-config/system-config.service';
import { SystemConfigKey } from 'src/system-config/system-config.constant';
import { RoleEnum } from 'src/role/role.enum';
import { User } from 'src/user/user.entity';
import {
  SharedUserLookupResponse,
  SharedUserServiceClient,
} from 'src/external-services/shared-user-service/shared-user-service.client';
import { batchLookupSharedUserIdentities } from 'src/user/user.helper';
import { Workbook } from 'exceljs';
@Injectable()
export class TableBookingService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    @InjectRepository(TableBookingEntity)
    private readonly repository: Repository<TableBookingEntity>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly transactionManagerService: TransactionManagerService,
    @InjectMapper()
    private readonly mapper: Mapper,
    private readonly notificationUtils: NotificationUtils,
    private readonly mailService: MailService,
    private readonly systemConfigService: SystemConfigService,
    private readonly sharedUserServiceClient: SharedUserServiceClient,
  ) {}

  /**
   * Format a booking date into a readable `HH:mm DD/MM/YYYY` string.
   * @param {Date} date - The booking date
   * @returns {string} The formatted date
   */
  private formatBookingDate(date: Date): string {
    if (!date) return '';
    const pad = (value: number) => value.toString().padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())} ${pad(
      date.getDate(),
    )}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  }

  /**
   * Email manager/telesale staff (when they have an email) and the
   * system-configured table booking mailbox when a new booking is created.
   * @param {TableBookingEntity} booking - The newly created table booking
   */
  private async sendMailAfterTableBookingIsCreated(
    booking: TableBookingEntity,
  ) {
    const context = `${TableBookingService.name}.${this.sendMailAfterTableBookingIsCreated.name}`;

    const staffs = await this.userRepository.find({
      where: {
        role: {
          name: In([RoleEnum.Manager, RoleEnum.Telesale]),
        },
      },
    });

    // `email` la field IDENTITY (architect-http.md muc 1.6) - nguon that nam
    // ben `shared-user`. Cot `email_column` cuc bo chi con la cache, va tu
    // giai doan 1 KHONG CON duong nao ghi vao no khi nhan vien tu sua ho so:
    // `PATCH {terminal}/auth/profile` da bi xoa, UI goi thang
    // `PATCH {shared-user}/auth/profile`. Doc thang cache o day nghia la mail
    // dat ban di toi dia chi CU - hoac khong di toi ai, vi hang tao qua
    // `POST /user` khong bao gio co `email` (CreateUserRequestDto khong khai
    // field do). Chi con `PATCH /user/:slug` (admin sua ho nguoi khac) la
    // ghi song doi xuong cache.
    //
    // ⚠️ FAIL-OPEN CO CHU DICH, khac moi cho khac dung helper nay.
    // `batchLookupSharedUserIdentities` fail-closed (nem 503). O day khong
    // duoc phep: ham nay la side-effect chay SAU khi don dat ban da ghi
    // xong, de 503 noi len thi `POST /table-booking` bao loi trong khi ban
    // ghi van ton tai - nguoi dat lai lan hai thanh hai don. Hong thi rot ve
    // cache cuc bo + mot dong `warn`.
    let identityById = new Map<string, SharedUserLookupResponse>();
    try {
      identityById = await batchLookupSharedUserIdentities(
        staffs.map((staff) => staff.sharedUserId),
        this.sharedUserServiceClient,
        this.logger,
        context,
      );
    } catch (error) {
      this.logger.warn(
        `Cannot read staff emails from shared-user, falling back to the local cache: ${error?.message}`,
        context,
      );
    }

    const configuredEmail = await this.systemConfigService.get(
      SystemConfigKey.TABLE_BOOKING_NOTIFICATION_EMAIL,
      false,
    );

    const toEmails = Array.from(
      new Set(
        [
          ...staffs.map(
            (staff) =>
              identityById.get(staff.sharedUserId)?.email ?? staff.email,
          ),
          configuredEmail,
        ].filter((email): email is string => !!email),
      ),
    );

    if (toEmails.length === 0) return;

    await this.mailService.sendTableBookingCreated(toEmails, {
      customerName: booking.name,
      phone: booking.phone,
      email: booking.email,
      bookingTime: this.formatBookingDate(booking.date),
      seats: booking.seats,
      note: booking.note,
    });
  }
  private assignCreateDto(
    createTableBookingDto: CreateTableBookingDto,
  ): TableBookingEntity {
    const tableBooking = new TableBookingEntity();
    tableBooking.slug = getRandomString();
    tableBooking.createdAt = new Date();
    tableBooking.name = createTableBookingDto.name;
    tableBooking.email = createTableBookingDto.email ?? null;
    tableBooking.phone = createTableBookingDto.phone;
    tableBooking.date = parseBookingDate(createTableBookingDto.date);
    tableBooking.seats = createTableBookingDto.seats ?? null;
    tableBooking.note = createTableBookingDto.note ?? null;
    return tableBooking;
  }

  async create(
    createTableBookingDto: CreateTableBookingDto,
  ): Promise<TableBookingResponseDto> {
    const context = `${TableBookingService.name}.${this.create.name}`;
    const created =
      await this.transactionManagerService.execute<TableBookingEntity>(
        async (manager) => {
          const tableBooking = this.assignCreateDto(createTableBookingDto);
          return await manager.save(tableBooking);
        },
        (result) => {
          this.logger.log(
            `Create table booking ${result.slug} successfully`,
            context,
          );
        },
        (error) => {
          this.logger.error(
            `Error when create table booking: ${error.message}`,
            error.stack,
            context,
          );
          throw error;
        },
      );

    // Notify staff so the new booking can be confirmed.
    await this.notificationUtils.sendNotificationAfterTableBookingIsCreated(
      created,
    );

    // Email manager/telesale staff and the configured booking mailbox.
    await this.sendMailAfterTableBookingIsCreated(created);

    return this.mapper.map(
      created,
      TableBookingEntity,
      TableBookingResponseDto,
    );
  }

  private assignUpdateDto(
    tableBooking: TableBookingEntity,
    updateTableBookingDto: UpdateTableBookingDto,
  ): TableBookingEntity {
    for (const [key, value] of Object.entries(updateTableBookingDto)) {
      if (value === undefined) continue;
      if (key === 'date') {
        tableBooking.date = parseBookingDate(value as string);
        continue;
      }
      tableBooking[key] = value;
    }
    return tableBooking;
  }

  async update(
    slug: string,
    updateTableBookingDto: UpdateTableBookingDto,
  ): Promise<TableBookingResponseDto> {
    const context = `${TableBookingService.name}.${this.update.name}`;

    const tableBooking = await this.repository.findOne({
      where: { slug: slug },
    });
    if (!tableBooking) {
      this.logger.error(`Table booking ${slug} not found`, null, context);
      throw new NotFoundException('Table booking not found');
    }

    const previousStatus = tableBooking.status;
    this.assignUpdateDto(tableBooking, updateTableBookingDto);

    const updated =
      await this.transactionManagerService.execute<TableBookingEntity>(
        async (manager) => {
          return await manager.save(tableBooking);
        },
        (result) => {
          this.logger.log(
            `Update table booking ${result.slug} successfully`,
            context,
          );
        },
        (error) => {
          this.logger.error(
            `Error when update table booking: ${error.message}`,
            error.stack,
            context,
          );
          throw error;
        },
      );

    // Notify staff when the booking transitions into the confirmed status.
    if (
      updated.status === BookingStatus.CONFIRMED &&
      previousStatus !== BookingStatus.CONFIRMED
    ) {
      await this.notificationUtils.sendNotificationAfterTableBookingIsConfirmed(
        updated,
      );
    }

    return this.mapper.map(
      updated,
      TableBookingEntity,
      TableBookingResponseDto,
    );
  }
  /**
   * Build TypeORM where options from the table booking query filters.
   * Shared by `getAll` and `exportToExcel` so both apply identical filters.
   * @param {GetTableBookingQueryDto} query - The table booking query
   * @returns {FindOptionsWhere<TableBookingEntity>} The where options
   */
  private buildWhereOptions(
    query: GetTableBookingQueryDto,
  ): FindOptionsWhere<TableBookingEntity> {
    // Parse query into TypeORM where options
    const whereOptions: FindOptionsWhere<TableBookingEntity> = {};
    if (query.slug) {
      whereOptions.slug = query.slug;
    }
    if (query.name) {
      whereOptions.name = Like(`%${query.name}%`);
    }
    if (query.phone) {
      whereOptions.phone = Like(`%${query.phone}%`);
    }
    if (query.email) {
      whereOptions.email = Like(`%${query.email}%`);
    }
    if (query.seats !== undefined) {
      whereOptions.seats = query.seats;
    }
    if (query.table !== undefined) {
      whereOptions.table = query.table;
    }
    if (query.deposit !== undefined) {
      whereOptions.deposit = query.deposit;
    }
    if (query.status) {
      whereOptions.status = query.status;
    }
    // Filter by the day the booking record was created (createdAt).
    if (query.createdDate) {
      const createdRange = getBookingDayRange(query.createdDate);
      if (!createdRange) {
        throw new BadRequestException(
          `Invalid createdDate filter, expected ${BOOKING_DAY_FORMAT}`,
        );
      }
      whereOptions.createdAt = Between(createdRange.start, createdRange.end);
    }
    // Resolve the day bounds from either a single `date` (by date) or a
    // `fromDate`/`toDate` pair (date between). `time` (HH:mm), when present,
    // matches the actual time-of-day on each booking within those bounds.
    let start: Date | null = null;
    let end: Date | null = null;

    if (query.date) {
      const dayRange = getBookingDayRange(query.date);
      if (!dayRange) {
        throw new BadRequestException(
          `Invalid date filter, expected ${BOOKING_DAY_FORMAT}`,
        );
      }
      start = dayRange.start;
      end = dayRange.end;
    } else {
      if (query.fromDate) {
        const fromRange = getBookingDayRange(query.fromDate);
        if (!fromRange) {
          throw new BadRequestException(
            `Invalid fromDate filter, expected ${BOOKING_DAY_FORMAT}`,
          );
        }
        start = fromRange.start;
      }
      if (query.toDate) {
        const toRange = getBookingDayRange(query.toDate);
        if (!toRange) {
          throw new BadRequestException(
            `Invalid toDate filter, expected ${BOOKING_DAY_FORMAT}`,
          );
        }
        end = toRange.end;
      }
      if (start && end && start.getTime() > end.getTime()) {
        throw new BadRequestException('fromDate must not be after toDate');
      }
    }

    if (query.time) {
      // Match bookings whose time-of-day equals the requested HH:mm, optionally
      // constrained to the resolved day bounds. `time` is HH:mm-validated by the
      // DTO. MySQL: compare the formatted time component of the date column.
      whereOptions.date = Raw(
        (alias) => {
          const conditions = [`DATE_FORMAT(${alias}, '%H:%i') = :bookingTime`];
          if (start) conditions.push(`${alias} >= :bookingStart`);
          if (end) conditions.push(`${alias} <= :bookingEnd`);
          return conditions.join(' AND ');
        },
        {
          bookingTime: query.time,
          ...(start ? { bookingStart: start } : {}),
          ...(end ? { bookingEnd: end } : {}),
        },
      );
    } else if (start && end) {
      whereOptions.date = Between(start, end);
    } else if (start) {
      whereOptions.date = MoreThanOrEqual(start);
    } else if (end) {
      whereOptions.date = LessThanOrEqual(end);
    }

    return whereOptions;
  }

  async getAll(
    query: GetTableBookingQueryDto,
  ): Promise<AppPaginatedResponseDto<TableBookingResponseDto>> {
    const context = `${TableBookingService.name}.${this.getAll.name}`;

    const findManyOptions: FindManyOptions<TableBookingEntity> = {
      where: this.buildWhereOptions(query),
      order: { date: 'ASC', createdAt: 'DESC' },
    };

    if (query.hasPaging) {
      findManyOptions.skip = (query.page - 1) * query.size;
      findManyOptions.take = query.size;
    }

    const [tableBookings, total] =
      await this.repository.findAndCount(findManyOptions);

    this.logger.log(`Get all table bookings: ${total} found`, context);

    const page = query.hasPaging ? query.page : 1;
    const pageSize = query.hasPaging ? query.size : total;
    const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
    const items = this.mapper.mapArray(
      tableBookings,
      TableBookingEntity,
      TableBookingResponseDto,
    );

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrevios: page > 1,
    } as AppPaginatedResponseDto<TableBookingResponseDto>;
  }

  /**
   * Export table bookings matching the query filters to an Excel buffer.
   * Paging is ignored so every matching booking is exported.
   * @param {GetTableBookingQueryDto} query - The table booking query
   * @returns {Promise<Buffer>} The xlsx file content
   */
  async exportToExcel(query: GetTableBookingQueryDto): Promise<Buffer> {
    const context = `${TableBookingService.name}.${this.exportToExcel.name}`;

    const tableBookings = await this.repository.find({
      where: this.buildWhereOptions(query),
      order: { date: 'ASC', createdAt: 'DESC' },
    });

    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Table bookings');

    worksheet.columns = [
      { header: 'No.', key: 'no', width: 6 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Booking time', key: 'date', width: 20 },
      { header: 'Seats', key: 'seats', width: 8 },
      { header: 'Table', key: 'table', width: 10 },
      { header: 'Deposit', key: 'deposit', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Note', key: 'note', width: 40 },
      { header: 'Created at', key: 'createdAt', width: 20 },
    ];

    tableBookings.forEach((booking, index) => {
      worksheet.addRow({
        no: index + 1,
        name: booking.name,
        phone: booking.phone,
        email: booking.email ?? '',
        date: this.formatBookingDate(booking.date),
        seats: booking.seats ?? '',
        table: booking.table ?? '',
        deposit: booking.deposit ?? '',
        status: booking.status,
        note: booking.note ?? '',
        createdAt: this.formatBookingDate(booking.createdAt),
      });
    });

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEEEEEE' },
      };
    });

    worksheet.getColumn('deposit').numFmt = '#,##0';
    worksheet.getColumn('note').alignment = { wrapText: true };
    worksheet.eachRow((row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    this.logger.log(
      `Export ${tableBookings.length} table bookings to excel`,
      context,
    );

    return buffer;
  }
  async remove(slug: string): Promise<TableBookingResponseDto> {
    const context = `${TableBookingService.name}.${this.remove.name}`;
    const tableBooking = await this.repository.findOne({
      where: { slug },
      withDeleted: true,
    });
    if (!tableBooking) {
      this.logger.error(`Cannot find table booking ${slug}`, context);
      throw new NotFoundException('Table booking not found');
    }
    if (tableBooking.deletedAt) {
      this.logger.warn(`Table booking ${slug} is already deleted`, context);
      throw new BadRequestException('Table booking is already deleted');
    }
    const removed =
      await this.transactionManagerService.execute<TableBookingEntity>(
        async (manager) => {
          return await manager.softRemove(tableBooking);
        },
        (result) => {
          this.logger.log(
            `Delete table booking ${result.slug} successfully`,
            context,
          );
        },
        (error) => {
          this.logger.error(`Error removing table booking`, error);
        },
      );
    return this.mapper.map(
      removed,
      TableBookingEntity,
      TableBookingResponseDto,
    );
  }
}
