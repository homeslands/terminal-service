import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import moment from 'moment';
import {
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WorkShift } from './work-shift.entity';
import { OrderResponseDto } from 'src/order/order.dto';
import { InvoiceResponseDto } from 'src/invoice/invoice.dto';
import { WorkShiftStatus } from './work-shift.constants';
import { WorkShiftException } from './work-shift.exception';
import {
  WORK_SHIFT_BRANCH_HAS_ACTIVE,
  WORK_SHIFT_FORBIDDEN,
  WORK_SHIFT_NOT_ACTIVE,
  WORK_SHIFT_NOT_FOUND,
  WORK_SHIFT_NO_ACTIVE,
  WorkShiftValidation,
} from './work-shift.validation';
import {
  CloseWorkShiftRequestDto,
  ForceCloseWorkShiftRequestDto,
  GetWorkShiftsQueryDto,
  OpenWorkShiftRequestDto,
  PaymentMethodSummaryDto,
  ShiftStaffSummaryDto,
  UserBasicDto,
  WorkShiftBasicResponseDto,
  WorkShiftListResponseDto,
  WorkShiftResponseDto,
  WorkShiftSummaryResponseDto,
  getPaymentMethodDisplayName,
} from './work-shift.dto';
import { Order } from 'src/order/order.entity';
import { Invoice } from 'src/invoice/invoice.entity';
import { User } from 'src/user/user.entity';
import { Branch } from 'src/branch/branch.entity';
import { CurrentUserDto } from 'src/user/user.dto';
import { OrderStatus } from 'src/order/order.constants';
import { RoleEnum } from 'src/role/role.enum';
import { getRandomString } from 'src/helper';
import {
  SharedUserLookupResponse,
  SharedUserServiceClient,
} from 'src/external-services/shared-user-service/shared-user-service.client';
import { batchLookupSharedUserIdentities } from 'src/user/user.helper';
import { mergeOrderOwnerIdentity } from 'src/order/order-owner-identity';

/** Mot dong tong hop nhan vien cua ca (gom theo `order.owner`). */
type ShiftStaffEntry = { user: User; orderCount: number; revenue: number };

@Injectable()
export class WorkShiftService {
  constructor(
    @InjectRepository(WorkShift)
    private readonly workShiftRepository: Repository<WorkShift>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    @InjectMapper()
    private readonly mapper: Mapper,
    // Buoc 4.6b - ho ten + SDT cua thu ngan va nhan vien ca lay tu shared-user.
    private readonly sharedUserServiceClient: SharedUserServiceClient,
  ) {}

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Buoc 4.6b - tra identity cua moi nguoi can hien tren man ca (thu ngan,
   * nhan vien trong tong hop) bang MOT lan batch-lookup. Fail-closed:
   * shared-user khong tra loi => 503 `SharedUserUnavailableException`.
   *
   * Duong GHI (mo / dong / ep dong ca) goi ham nay TRUOC lenh ghi: shared-user
   * hong thi 503 khi ca chua doi. Tra SAU khi ghi thi client nhan 503 cho mot
   * ca DA mo/dong - goi lai la "chi nhanh da co ca" hoac "khong co ca".
   */
  private lookupShiftPeople(
    people: Array<User | null | undefined>,
    context: string,
  ): Promise<Map<string, SharedUserLookupResponse>> {
    return batchLookupSharedUserIdentities(
      people.map((person) => person?.sharedUserId),
      this.sharedUserServiceClient,
      this.logger,
      context,
    );
  }

  /**
   * Buoc 4.6b - `UserBasicDto` (slug + ho ten + SDT) tu identity cua
   * shared-user; KHONG doc cot ho ten / SDT cua hang `User` cuc bo.
   *
   * Khong co identity (`sharedUserId` treo) => ho ten + SDT de null + mot
   * dong warn, khong nem: mot nguoi treo khong duoc lam hong ca bao cao ca,
   * va cung khong roi ve cache cuc bo.
   */
  private toUserBasic(
    person: User,
    identityById: Map<string, SharedUserLookupResponse>,
    context: string,
  ): UserBasicDto {
    const identity = identityById.get(person.sharedUserId);
    if (!identity) {
      this.logger.warn(
        `No shared-user identity for user ${person.id} (sharedUserId ${person.sharedUserId}): name and phone left empty`,
        context,
      );
    }
    const u = new UserBasicDto();
    u.slug = person.slug;
    u.firstName = identity?.firstName ?? null;
    u.lastName = identity?.lastName ?? null;
    u.phonenumber = identity?.phonenumber ?? null;
    return u;
  }

  private mapToBasicDto(
    ws: WorkShift,
    identityById: Map<string, SharedUserLookupResponse>,
    context: string,
  ): WorkShiftBasicResponseDto {
    const dto = new WorkShiftBasicResponseDto();
    dto.slug = ws.slug;
    dto.createdAt = ws.createdAt?.toISOString();
    dto.actualStartTime = ws.actualStartTime;
    dto.actualEndTime = ws.actualEndTime;
    dto.status = ws.status;
    dto.openingCash = Number(ws.openingCash);
    dto.closingCash = ws.closingCash != null ? Number(ws.closingCash) : null;
    dto.note = ws.note;
    if (ws.cashier) {
      dto.cashier = this.toUserBasic(ws.cashier, identityById, context);
    }
    if (ws.branch) {
      dto.branch = { slug: ws.branch.slug, name: ws.branch.name } as any;
    }
    return dto;
  }

  private async computeTotals(workShiftId: string): Promise<{
    totalOrders: number;
    totalInvoicesPaid: number;
    totalRevenue: number;
  }> {
    const totalOrders = await this.orderRepository.count({
      where: { workShift: { id: workShiftId } },
    });
    const invoices = await this.invoiceRepository.find({
      where: { workShift: { id: workShiftId }, status: 'paid' },
    });
    const totalInvoicesPaid = invoices.length;
    const totalRevenue = invoices.reduce(
      (sum, inv) => sum + Number(inv.amount),
      0,
    );
    return { totalOrders, totalInvoicesPaid, totalRevenue };
  }

  private async getPreShiftCutoffTime(branchId: string): Promise<Date> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastClosed = await this.workShiftRepository.findOne({
      where: {
        branch: { id: branchId },
        status: WorkShiftStatus.CLOSED,
        actualEndTime: MoreThanOrEqual(today),
      },
      order: { actualEndTime: 'DESC' },
    });

    return lastClosed?.actualEndTime ?? today;
  }

  private async linkPreShiftOrders(
    workShift: WorkShift,
    branchId: string,
  ): Promise<number> {
    const cutoffTime = await this.getPreShiftCutoffTime(branchId);

    const preShiftOrders = await this.orderRepository.find({
      where: {
        branch: { id: branchId },
        workShift: IsNull(),
        status: Not(OrderStatus.CANCEL),
        createdAt: MoreThanOrEqual(cutoffTime),
      },
    });

    for (const order of preShiftOrders) {
      order.workShift = workShift;
    }
    if (preShiftOrders.length > 0) {
      await this.orderRepository.save(preShiftOrders);
    }
    return preShiftOrders.length;
  }

  // ---------------------------------------------------------------------------
  // Cashier operations
  // ---------------------------------------------------------------------------

  async openShift(
    dto: OpenWorkShiftRequestDto,
    currentUser: CurrentUserDto,
  ): Promise<WorkShiftResponseDto> {
    const context = `${WorkShiftService.name}.${this.openShift.name}`;

    const cashier = await this.userRepository.findOne({
      where: { id: currentUser.userId },
      relations: { role: true, branch: true },
    });

    const branch = cashier.branch;

    const conflicting = await this.workShiftRepository.findOne({
      where: {
        branch: { id: branch.id },
        status: WorkShiftStatus.ACTIVE,
      },
    });
    if (conflicting) {
      throw new WorkShiftException(
        WorkShiftValidation[WORK_SHIFT_BRANCH_HAS_ACTIVE],
      );
    }

    // Buoc 4.6b - tra identity thu ngan TRUOC khi ghi ca.
    const identityById = await this.lookupShiftPeople([cashier], context);

    const workShift = this.workShiftRepository.create({
      slug: getRandomString(),
      cashier,
      branch,
      actualStartTime: new Date(),
      status: WorkShiftStatus.ACTIVE,
      openingCash: dto.openingCash,
      closingCash: null,
      note: null,
    });

    const saved = await this.workShiftRepository.save(workShift);
    this.logger.log(`Opened work shift ${saved.slug}`, context);

    const preShiftLinked = await this.linkPreShiftOrders(saved, branch.id);

    const totals = await this.computeTotals(saved.id);
    const result = new WorkShiftResponseDto();
    Object.assign(result, this.mapToBasicDto(saved, identityById, context));
    result.totalOrders = totals.totalOrders;
    result.totalInvoicesPaid = totals.totalInvoicesPaid;
    result.totalRevenue = totals.totalRevenue;
    result.preShiftOrdersLinked = preShiftLinked;
    return result;
  }

  async closeShift(
    dto: CloseWorkShiftRequestDto,
    currentUser: CurrentUserDto,
  ): Promise<WorkShiftSummaryResponseDto> {
    const context = `${WorkShiftService.name}.${this.closeShift.name}`;

    const workShift = await this.workShiftRepository.findOne({
      where: {
        cashier: { id: currentUser.userId },
        status: WorkShiftStatus.ACTIVE,
      },
      relations: { cashier: true, branch: true },
    });

    if (!workShift) {
      throw new WorkShiftException(WorkShiftValidation[WORK_SHIFT_NO_ACTIVE]);
    }

    // Buoc 4.6b - tra identity (thu ngan + nhan vien ca) TRUOC khi dong ca.
    const staff = await this.collectShiftStaff(workShift.id);
    const identityById = await this.lookupShiftPeople(
      [workShift.cashier, ...staff.map((entry) => entry.user)],
      context,
    );

    workShift.actualEndTime = new Date();
    workShift.status = WorkShiftStatus.CLOSED;
    if (dto.closingCash !== undefined) workShift.closingCash = dto.closingCash;
    if (dto.note !== undefined) workShift.note = dto.note;

    const closed = await this.workShiftRepository.save(workShift);
    this.logger.log(`Closed work shift ${closed.slug}`, context);

    return this.buildSummary(closed, staff, identityById, context);
  }

  async getCurrentShift(
    currentUser: CurrentUserDto,
  ): Promise<WorkShiftResponseDto> {
    const context = `${WorkShiftService.name}.${this.getCurrentShift.name}`;
    const workShift = await this.workShiftRepository.findOne({
      where: {
        cashier: { id: currentUser.userId },
        status: WorkShiftStatus.ACTIVE,
      },
      relations: ['cashier', 'branch'],
    });

    if (!workShift) {
      throw new WorkShiftException(WorkShiftValidation[WORK_SHIFT_NO_ACTIVE]);
    }

    const identityById = await this.lookupShiftPeople(
      [workShift.cashier],
      context,
    );
    const totals = await this.computeTotals(workShift.id);
    const result = new WorkShiftResponseDto();
    Object.assign(result, this.mapToBasicDto(workShift, identityById, context));
    result.totalOrders = totals.totalOrders;
    result.totalInvoicesPaid = totals.totalInvoicesPaid;
    result.totalRevenue = totals.totalRevenue;
    return result;
  }

  // ---------------------------------------------------------------------------
  // Manager/Admin operations
  // ---------------------------------------------------------------------------

  async forceClose(
    slug: string,
    dto: ForceCloseWorkShiftRequestDto,
    currentUser: CurrentUserDto,
  ): Promise<WorkShiftSummaryResponseDto> {
    const context = `${WorkShiftService.name}.${this.forceClose.name}`;

    const workShift = await this.workShiftRepository.findOne({
      where: { slug },
      relations: ['cashier', 'branch'],
    });

    if (!workShift) {
      throw new WorkShiftException(WorkShiftValidation[WORK_SHIFT_NOT_FOUND]);
    }
    if (workShift.status !== WorkShiftStatus.ACTIVE) {
      throw new WorkShiftException(WorkShiftValidation[WORK_SHIFT_NOT_ACTIVE]);
    }

    const requester = await this.userRepository.findOne({
      where: { id: currentUser.userId },
      relations: ['role', 'branch'],
    });
    const requesterRole = requester?.role?.name as RoleEnum;

    if (
      requesterRole === RoleEnum.Manager &&
      workShift.branch.id !== requester.branch?.id
    ) {
      throw new WorkShiftException(WorkShiftValidation[WORK_SHIFT_FORBIDDEN]);
    }

    // Buoc 4.6b - nhu closeShift: tra identity TRUOC khi dong ca.
    const staff = await this.collectShiftStaff(workShift.id);
    const identityById = await this.lookupShiftPeople(
      [workShift.cashier, ...staff.map((entry) => entry.user)],
      context,
    );

    workShift.actualEndTime = new Date();
    workShift.status = WorkShiftStatus.CLOSED;
    workShift.note = dto.note;

    const closed = await this.workShiftRepository.save(workShift);
    this.logger.log(
      `Force-closed work shift ${closed.slug} by ${requester.slug}`,
      context,
    );

    return this.buildSummary(closed, staff, identityById, context);
  }

  async getActiveShifts(
    currentUser: CurrentUserDto,
  ): Promise<WorkShiftResponseDto[]> {
    const context = `${WorkShiftService.name}.${this.getActiveShifts.name}`;
    const requester = await this.userRepository.findOne({
      where: { id: currentUser.userId },
      relations: ['role', 'branch'],
    });
    const role = requester?.role?.name as RoleEnum;

    const where: any = { status: WorkShiftStatus.ACTIVE };
    if (role === RoleEnum.Manager) {
      where.branch = { id: requester.branch?.id };
    }

    const shifts = await this.workShiftRepository.find({
      where,
      relations: ['cashier', 'branch'],
      order: { actualStartTime: 'DESC' },
    });

    // Buoc 4.6b - mot lan batch-lookup cho moi thu ngan cua danh sach.
    const identityById = await this.lookupShiftPeople(
      shifts.map((ws) => ws.cashier),
      context,
    );
    const results: WorkShiftResponseDto[] = [];
    for (const ws of shifts) {
      const totals = await this.computeTotals(ws.id);
      const r = new WorkShiftResponseDto();
      Object.assign(r, this.mapToBasicDto(ws, identityById, context));
      r.totalOrders = totals.totalOrders;
      r.totalInvoicesPaid = totals.totalInvoicesPaid;
      r.totalRevenue = totals.totalRevenue;
      results.push(r);
    }
    return results;
  }

  async getList(
    query: GetWorkShiftsQueryDto,
    currentUser: CurrentUserDto,
  ): Promise<WorkShiftListResponseDto> {
    const context = `${WorkShiftService.name}.${this.getList.name}`;
    const requester = await this.userRepository.findOne({
      where: { id: currentUser.userId },
      relations: ['role', 'branch'],
    });
    const role = requester?.role?.name as RoleEnum;

    const page = query.page ?? 1;
    const size = query.size ?? 10;

    const qb = this.workShiftRepository
      .createQueryBuilder('ws')
      .leftJoinAndSelect('ws.cashier', 'cashier')
      .leftJoinAndSelect('ws.branch', 'branch')
      .leftJoinAndSelect('cashier.role', 'role');

    if (role === RoleEnum.Cashier) {
      qb.andWhere('cashier.id = :cashierId', {
        cashierId: requester.id,
      });
    } else if (role === RoleEnum.Manager) {
      qb.andWhere('branch.id = :branchId', {
        branchId: requester.branch?.id,
      });
      if (query.cashierSlug) {
        qb.andWhere('cashier.slug = :cashierSlug', {
          cashierSlug: query.cashierSlug,
        });
      }
    } else {
      if (query.branchSlug) {
        qb.andWhere('branch.slug = :branchSlug', {
          branchSlug: query.branchSlug,
        });
      }
      if (query.cashierSlug) {
        qb.andWhere('cashier.slug = :cashierSlug', {
          cashierSlug: query.cashierSlug,
        });
      }
    }

    if (query.status) {
      qb.andWhere('ws.status = :status', { status: query.status });
    }
    if (query.startDate) {
      qb.andWhere('ws.actualStartTime >= :startDate', {
        startDate: moment(query.startDate).startOf('day').toDate(),
      });
    }
    if (query.endDate) {
      qb.andWhere('ws.actualStartTime <= :endDate', {
        endDate: moment(query.endDate).endOf('day').toDate(),
      });
    }

    const total = await qb.getCount();
    qb.orderBy('ws.actualStartTime', 'DESC')
      .skip((page - 1) * size)
      .take(size);

    const shifts = await qb.getMany();

    // Buoc 4.6b - mot lan batch-lookup cho ca trang.
    const identityById = await this.lookupShiftPeople(
      shifts.map((ws) => ws.cashier),
      context,
    );
    const data: WorkShiftResponseDto[] = [];
    for (const ws of shifts) {
      const totals = await this.computeTotals(ws.id);
      const r = new WorkShiftResponseDto();
      Object.assign(r, this.mapToBasicDto(ws, identityById, context));
      r.totalOrders = totals.totalOrders;
      r.totalInvoicesPaid = totals.totalInvoicesPaid;
      r.totalRevenue = totals.totalRevenue;
      data.push(r);
    }

    return { data, total, page, size };
  }

  async getBySlug(
    slug: string,
    currentUser: CurrentUserDto,
  ): Promise<WorkShiftResponseDto> {
    const context = `${WorkShiftService.name}.${this.getBySlug.name}`;
    const workShift = await this.findAndAuthorize(slug, currentUser);
    const identityById = await this.lookupShiftPeople(
      [workShift.cashier],
      context,
    );
    const totals = await this.computeTotals(workShift.id);
    const result = new WorkShiftResponseDto();
    Object.assign(result, this.mapToBasicDto(workShift, identityById, context));
    result.totalOrders = totals.totalOrders;
    result.totalInvoicesPaid = totals.totalInvoicesPaid;
    result.totalRevenue = totals.totalRevenue;
    return result;
  }

  async getOrders(
    slug: string,
    currentUser: CurrentUserDto,
  ): Promise<OrderResponseDto[]> {
    const workShift = await this.findAndAuthorize(slug, currentUser);
    const orders = await this.getWorkShiftOrders(
      workShift.id,
      workShift.branch.id,
    );
    return mergeOrderOwnerIdentity(
      orders,
      this.mapper.mapArray(orders, Order, OrderResponseDto),
      this.sharedUserServiceClient,
      this.logger,
      `${WorkShiftService.name}.${this.getOrders.name}`,
    );
  }

  async getInvoices(
    slug: string,
    currentUser: CurrentUserDto,
  ): Promise<InvoiceResponseDto[]> {
    const workShift = await this.findAndAuthorize(slug, currentUser);
    const invoices = await this.invoiceRepository.find({
      where: { workShift: { id: workShift.id } },
      relations: ['order'],
    });
    return this.mapper.mapArray(invoices, Invoice, InvoiceResponseDto);
  }

  async getStaff(
    slug: string,
    currentUser: CurrentUserDto,
  ): Promise<ShiftStaffSummaryDto[]> {
    const context = `${WorkShiftService.name}.${this.getStaff.name}`;
    const workShift = await this.findAndAuthorize(slug, currentUser);
    return this.buildStaffSummary(workShift.id, context);
  }

  async getSummary(
    slug: string,
    currentUser: CurrentUserDto,
  ): Promise<WorkShiftSummaryResponseDto> {
    const context = `${WorkShiftService.name}.${this.getSummary.name}`;
    const workShift = await this.findAndAuthorize(slug, currentUser);
    return this.buildSummaryWithLookup(workShift, context);
  }

  // Current shift variants (for CASHIER)
  async getCurrentOrders(
    currentUser: CurrentUserDto,
  ): Promise<OrderResponseDto[]> {
    const ws = await this.getActiveShiftForCashier(currentUser);
    const orders = await this.getWorkShiftOrders(ws.id, ws.branch.id);
    return mergeOrderOwnerIdentity(
      orders,
      this.mapper.mapArray(orders, Order, OrderResponseDto),
      this.sharedUserServiceClient,
      this.logger,
      `${WorkShiftService.name}.${this.getCurrentOrders.name}`,
    );
  }

  async getCurrentInvoices(
    currentUser: CurrentUserDto,
  ): Promise<InvoiceResponseDto[]> {
    const ws = await this.getActiveShiftForCashier(currentUser);
    const invoices = await this.invoiceRepository.find({
      where: { workShift: { id: ws.id } },
      relations: { order: true },
    });
    return this.mapper.mapArray(invoices, Invoice, InvoiceResponseDto);
  }

  async getCurrentStaff(
    currentUser: CurrentUserDto,
  ): Promise<ShiftStaffSummaryDto[]> {
    const context = `${WorkShiftService.name}.${this.getCurrentStaff.name}`;
    const ws = await this.getActiveShiftForCashier(currentUser);
    return this.buildStaffSummary(ws.id, context);
  }

  async getCurrentSummary(
    currentUser: CurrentUserDto,
  ): Promise<WorkShiftSummaryResponseDto> {
    const context = `${WorkShiftService.name}.${this.getCurrentSummary.name}`;
    const ws = await this.getActiveShiftForCashier(currentUser);
    return this.buildSummaryWithLookup(ws, context);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async getActiveShiftForCashier(
    currentUser: CurrentUserDto,
  ): Promise<WorkShift> {
    const ws = await this.workShiftRepository.findOne({
      where: {
        cashier: { id: currentUser.userId },
        status: WorkShiftStatus.ACTIVE,
      },
      relations: { cashier: true, branch: true },
    });
    if (!ws) {
      throw new WorkShiftException(WorkShiftValidation[WORK_SHIFT_NO_ACTIVE]);
    }
    return ws;
  }

  private async findAndAuthorize(
    slug: string,
    currentUser: CurrentUserDto,
  ): Promise<WorkShift> {
    const workShift = await this.workShiftRepository.findOne({
      where: { slug },
      relations: ['cashier', 'branch'],
    });
    if (!workShift) {
      throw new WorkShiftException(WorkShiftValidation[WORK_SHIFT_NOT_FOUND]);
    }

    const requester = await this.userRepository.findOne({
      where: { id: currentUser.userId },
      relations: ['role', 'branch'],
    });
    const role = requester?.role?.name as RoleEnum;

    if (role === RoleEnum.Cashier) {
      if (workShift.cashier.id !== requester.id) {
        throw new WorkShiftException(WorkShiftValidation[WORK_SHIFT_FORBIDDEN]);
      }
    } else if (role === RoleEnum.Manager) {
      if (workShift.branch.id !== requester.branch?.id) {
        throw new WorkShiftException(WorkShiftValidation[WORK_SHIFT_FORBIDDEN]);
      }
    }

    return workShift;
  }

  private async getWorkShiftOrders(
    workShiftId: string,
    branchId: string,
  ): Promise<Order[]> {
    const directOrders = await this.orderRepository.find({
      where: { workShift: { id: workShiftId } },
      relations: { owner: true, branch: true, invoice: true },
    });

    const workShift = await this.workShiftRepository.findOne({
      where: { id: workShiftId },
    });

    const prevShift = await this.workShiftRepository.findOne({
      where: {
        branch: { id: branchId },
        status: WorkShiftStatus.CLOSED,
        actualEndTime: LessThanOrEqual(workShift.actualStartTime),
      },
      order: { actualEndTime: 'DESC' },
    });

    let crossOrders: Order[] = [];
    let unpaidCrossOrders: Order[] = [];
    if (prevShift?.actualEndTime) {
      crossOrders = await this.orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.owner', 'owner')
        .leftJoinAndSelect('order.branch', 'branch')
        .innerJoinAndSelect('order.invoice', 'invoice')
        .where('order.workShift = :prevShiftId', { prevShiftId: prevShift.id })
        .andWhere('invoice.workShift = :workShiftId', { workShiftId })
        .getMany();

      unpaidCrossOrders = await this.orderRepository.find({
        where: {
          workShift: { id: prevShift.id },
          status: OrderStatus.PENDING,
        },
        relations: { owner: true, branch: true, invoice: true },
      });
    }

    return [...directOrders, ...crossOrders, ...unpaidCrossOrders];
  }

  /** Gom don cua ca theo `order.owner` - chi doc DB, khong dung identity. */
  private async collectShiftStaff(
    workShiftId: string,
  ): Promise<ShiftStaffEntry[]> {
    const orders = await this.orderRepository.find({
      where: { workShift: { id: workShiftId } },
      relations: { owner: true },
    });

    const staffMap = new Map<string, ShiftStaffEntry>();

    for (const order of orders) {
      if (!order.owner) continue;
      const existing = staffMap.get(order.owner.id);
      const revenue =
        order.status === OrderStatus.PAID ||
        order.status === OrderStatus.COMPLETED
          ? Number(order.subtotal)
          : 0;
      if (existing) {
        existing.orderCount++;
        existing.revenue += revenue;
      } else {
        staffMap.set(order.owner.id, {
          user: order.owner,
          orderCount: 1,
          revenue,
        });
      }
    }

    return Array.from(staffMap.values());
  }

  private toStaffSummary(
    staff: ShiftStaffEntry[],
    identityById: Map<string, SharedUserLookupResponse>,
    context: string,
  ): ShiftStaffSummaryDto[] {
    return staff.map((entry) => {
      const dto = new ShiftStaffSummaryDto();
      dto.staff = this.toUserBasic(entry.user, identityById, context);
      dto.totalOrdersCreated = entry.orderCount;
      dto.totalOrdersRevenue = entry.revenue;
      return dto;
    });
  }

  /** Buoc 4.6b - tong hop nhan vien ca, MOT lan batch-lookup cho ca nhom. */
  private async buildStaffSummary(
    workShiftId: string,
    context: string,
  ): Promise<ShiftStaffSummaryDto[]> {
    const staff = await this.collectShiftStaff(workShiftId);
    const identityById = await this.lookupShiftPeople(
      staff.map((entry) => entry.user),
      context,
    );
    return this.toStaffSummary(staff, identityById, context);
  }

  /** Duong DOC: tra identity (thu ngan + nhan vien) roi dung bao cao ca. */
  private async buildSummaryWithLookup(
    workShift: WorkShift,
    context: string,
  ): Promise<WorkShiftSummaryResponseDto> {
    const staff = await this.collectShiftStaff(workShift.id);
    const identityById = await this.lookupShiftPeople(
      [workShift.cashier, ...staff.map((entry) => entry.user)],
      context,
    );
    return this.buildSummary(workShift, staff, identityById, context);
  }

  /**
   * `staff` + `identityById` do noi goi chuan bi: duong ghi (dong ca) phai
   * tra identity TRUOC lenh ghi (`lookupShiftPeople`).
   */
  private async buildSummary(
    workShift: WorkShift,
    staff: ShiftStaffEntry[],
    identityById: Map<string, SharedUserLookupResponse>,
    context: string,
  ): Promise<WorkShiftSummaryResponseDto> {
    const invoices = await this.invoiceRepository.find({
      where: { workShift: { id: workShift.id }, status: 'paid' },
    });

    const paymentMap = new Map<
      string,
      { totalAmount: number; invoiceCount: number }
    >();
    let totalRevenue = 0;
    let cashRevenue = 0;

    for (const inv of invoices) {
      const amount = Number(inv.amount);
      totalRevenue += amount;
      const pm = inv.paymentMethod;
      if (pm === 'cash') cashRevenue += amount;
      const existing = paymentMap.get(pm);
      if (existing) {
        existing.totalAmount += amount;
        existing.invoiceCount++;
      } else {
        paymentMap.set(pm, { totalAmount: amount, invoiceCount: 1 });
      }
    }

    const paymentSummary: PaymentMethodSummaryDto[] = Array.from(
      paymentMap.entries(),
    ).map(([paymentMethod, data]) => ({
      paymentMethod,
      displayName: getPaymentMethodDisplayName(paymentMethod),
      totalAmount: data.totalAmount,
      invoiceCount: data.invoiceCount,
    }));

    const allOrders = await this.getWorkShiftOrders(
      workShift.id,
      workShift.branch?.id,
    );
    const directOrders = await this.orderRepository.count({
      where: { workShift: { id: workShift.id } },
    });
    const crossShiftOrdersCount = allOrders.length - directOrders;

    const staffSummary = this.toStaffSummary(staff, identityById, context);

    const closingCash =
      workShift.closingCash != null ? Number(workShift.closingCash) : null;
    const openingCash = Number(workShift.openingCash);
    const cashDifference =
      workShift.status === WorkShiftStatus.CLOSED && closingCash != null
        ? closingCash - openingCash - cashRevenue
        : null;

    const summary = new WorkShiftSummaryResponseDto();
    summary.workShift = this.mapToBasicDto(workShift, identityById, context);
    summary.openingCash = openingCash;
    summary.closingCash = closingCash;
    summary.cashRevenue = cashRevenue;
    summary.cashDifference = cashDifference;
    summary.paymentSummary = paymentSummary;
    summary.totalRevenue = totalRevenue;
    summary.totalOrders = directOrders;
    summary.totalInvoicesPaid = invoices.length;
    summary.crossShiftOrdersCount = Math.max(0, crossShiftOrdersCount);
    summary.staffSummary = staffSummary;
    summary.totalStaffWorked = staffSummary.length;
    return summary;
  }

  // ---------------------------------------------------------------------------
  // Public utility (used by order.service & payment.service)
  // ---------------------------------------------------------------------------

  async findActiveShiftForBranch(branchId: string): Promise<WorkShift | null> {
    return this.workShiftRepository.findOne({
      where: { branch: { id: branchId }, status: WorkShiftStatus.ACTIVE },
      relations: { cashier: true, branch: true },
    });
  }
}
