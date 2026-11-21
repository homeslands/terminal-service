import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  Inject,
  Logger,
} from '@nestjs/common';
import { BalanceService } from './balance.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FindUserBalanceDto } from './dto/find-user-balance.dto';
import { AppResponseDto } from 'src/app/app.dto';
import { BalanceResponseDto, MaxBalanceResponseDto } from './dto/balance-response.dto';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { HasRoles } from 'src/role/roles.decorator';
import { RoleEnum } from 'src/role/role.enum';

// Buoc 7.7d (QD17, QD-T6, QD-T10): ca hai route deu la "xem ho" - doc vi cua NGUOI
// KHAC o shared-user sau khi trend kiem role. Khach tu xem so du cua minh goi
// thang shared-user (`GET /balance` ben do, 7.8 doi client). Role viet TUONG
// MINH tung `RoleEnum.X` (khong spread hang): ca kiem tinh doc chu trong
// decorator.
@Controller('balance')
@ApiTags('Balance Resource')
@ApiBearerAuth()
export class BalanceController {
  constructor(
    private readonly balanceService: BalanceService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
  ) { }

  // QD-T10: GIU route nay cho nhan vien (man thanh toan doc so du cua CHU DON,
  // `staff-payment-method-radio-group.tsx`, ca Cashier o quay - QD-T6); bo
  // nhanh tu xem; `userSlug` bat
  // buoc. 7.9 KHONG xoa route nay.
  @Get()
  @HasRoles(
    RoleEnum.Staff,
    RoleEnum.Cashier,
    RoleEnum.Telesale,
    RoleEnum.Manager,
    RoleEnum.Admin,
    RoleEnum.SuperAdmin,
  )
  @ApiOperation({ summary: 'Get the balance of a customer (staff only)' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'The balance was retrieved successfully',
    type: BalanceResponseDto,
  })
  @HttpCode(HttpStatus.OK)
  async findByUser(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    payload: FindUserBalanceDto,
  ) {
    const result = await this.balanceService.findOneByUserSlug(
      payload.userSlug,
    );
    return {
      message: 'The balance was retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<BalanceResponseDto>;
  }

  // Man chinh sach xu: so du lon nhat / nho nhat toan vi.
  @Get("/analysis")
  @HasRoles(RoleEnum.Manager, RoleEnum.Admin, RoleEnum.SuperAdmin)
  @ApiOperation({ summary: 'Analyze balance in the system' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Analyze balance in the system',
    type: MaxBalanceResponseDto,
  })
  async maxBalance() {
    const context = `${BalanceController.name}.${this.maxBalance.name}`;
    this.logger.log(`REST request to analyze balance`, context);

    const result = await this.balanceService.analyze();
    return {
      message: '',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<MaxBalanceResponseDto>;
  }
}
