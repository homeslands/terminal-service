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
  ) {}

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private mapToBasicDto(ws: WorkShift): WorkShiftBasicResponseDto {
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
      const u = new UserBasicDto();
      u.slug = ws.cashier.slug;
      u.firstName = ws.cashier.firstName;
      u.lastName = (ws.cashier as any).lastName;
      u.phonenumber = ws.cashier.phonenumber;
      dto.cashier = u;
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
    Object.assign(result, this.mapToBasicDto(saved));
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

    workShift.actualEndTime = new Date();
    workShift.status = WorkShiftStatus.CLOSED;
    if (dto.closingCash !== undefined) workShift.closingCash = dto.closingCash;
    if (dto.note !== undefined) workShift.note = dto.note;

    const closed = await this.workShiftRepository.save(workShift);
    this.logger.log(`Closed work shift ${closed.slug}`, context);

    return this.buildSummary(closed);
  }

  async getCurrentShift(
    currentUser: CurrentUserDto,
  ): Promise<WorkShiftResponseDto> {
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

    const totals = await this.computeTotals(workShift.id);
    const result = new WorkShiftResponseDto();
    Object.assign(result, this.mapToBasicDto(workShift));
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

    workShift.actualEndTime = new Date();
    workShift.status = WorkShiftStatus.CLOSED;
    workShift.note = dto.note;

    const closed = await this.workShiftRepository.save(workShift);
    this.logger.log(
      `Force-closed work shift ${closed.slug} by ${requester.slug}`,
      context,
    );

    return this.buildSummary(closed);
  }

  async getActiveShifts(
    currentUser: CurrentUserDto,
  ): Promise<WorkShiftResponseDto[]> {
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

    const results: WorkShiftResponseDto[] = [];
    for (const ws of shifts) {
      const totals = await this.computeTotals(ws.id);
      const r = new WorkShiftResponseDto();
      Object.assign(r, this.mapToBasicDto(ws));
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

    const data: WorkShiftResponseDto[] = [];
    for (const ws of shifts) {
      const totals = await this.computeTotals(ws.id);
      const r = new WorkShiftResponseDto();
      Object.assign(r, this.mapToBasicDto(ws));
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
    const workShift = await this.findAndAuthorize(slug, currentUser);
    const totals = await this.computeTotals(workShift.id);
    const result = new WorkShiftResponseDto();
    Object.assign(result, this.mapToBasicDto(workShift));
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
    return this.mapper.mapArray(orders, Order, OrderResponseDto);
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
    const workShift = await this.findAndAuthorize(slug, currentUser);
    return this.buildStaffSummary(workShift.id);
  }

  async getSummary(
    slug: string,
    currentUser: CurrentUserDto,
  ): Promise<WorkShiftSummaryResponseDto> {
    const workShift = await this.findAndAuthorize(slug, currentUser);
    return this.buildSummary(workShift);
  }

  // Current shift variants (for CASHIER)
  async getCurrentOrders(
    currentUser: CurrentUserDto,
  ): Promise<OrderResponseDto[]> {
    const ws = await this.getActiveShiftForCashier(currentUser);
    const orders = await this.getWorkShiftOrders(ws.id, ws.branch.id);
    return this.mapper.mapArray(orders, Order, OrderResponseDto);
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
    const ws = await this.getActiveShiftForCashier(currentUser);
    return this.buildStaffSummary(ws.id);
  }

  async getCurrentSummary(
    currentUser: CurrentUserDto,
  ): Promise<WorkShiftSummaryResponseDto> {
    const ws = await this.getActiveShiftForCashier(currentUser);
    return this.buildSummary(ws);
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

  private async buildStaffSummary(
    workShiftId: string,
  ): Promise<ShiftStaffSummaryDto[]> {
    const orders = await this.orderRepository.find({
      where: { workShift: { id: workShiftId } },
      relations: { owner: true },
    });

    const staffMap = new Map<
      string,
      { user: User; orderCount: number; revenue: number }
    >();

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

    return Array.from(staffMap.values()).map((entry) => {
      const dto = new ShiftStaffSummaryDto();
      const u = new UserBasicDto();
      u.slug = entry.user.slug;
      u.firstName = entry.user.firstName;
      u.lastName = (entry.user as any).lastName;
      u.phonenumber = entry.user.phonenumber;
      dto.staff = u;
      dto.totalOrdersCreated = entry.orderCount;
      dto.totalOrdersRevenue = entry.revenue;
      return dto;
    });
  }

  private async buildSummary(
    workShift: WorkShift,
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

    const staffSummary = await this.buildStaffSummary(workShift.id);

    const closingCash =
      workShift.closingCash != null ? Number(workShift.closingCash) : null;
    const openingCash = Number(workShift.openingCash);
    const cashDifference =
      workShift.status === WorkShiftStatus.CLOSED && closingCash != null
        ? closingCash - openingCash - cashRevenue
        : null;

    const summary = new WorkShiftSummaryResponseDto();
    summary.workShift = this.mapToBasicDto(workShift);
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
