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
import { FindByFieldDto } from './dto/find-by-field.dto';
import { AppResponseDto } from 'src/app/app.dto';
import { BalanceResponseDto, MaxBalanceResponseDto } from './dto/balance-response.dto';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

@Controller('balance')
@ApiTags('Balance Resource')
@ApiBearerAuth()
export class BalanceController {
  constructor(
    private readonly balanceService: BalanceService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
  ) { }

  @Get()
  @ApiOperation({ summary: 'Get balance by field' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'The balance was retrieved successfully',
    type: BalanceResponseDto,
  })
  @HttpCode(HttpStatus.OK)
  async findByField(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    payload: FindByFieldDto,
  ) {
    const result = await this.balanceService.findOneByField(payload);
    return {
      message: 'The balance was retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<BalanceResponseDto>;
  }

  @Get("/analysis")
  @ApiOperation({ summary: 'Analyze balance in the system' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Analyze balance in the system',
    type: MaxBalanceResponseDto,
  })
  async maxBalance(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    payload: any,
  ) {
    const context = `${BalanceController.name}.${this.maxBalance.name}`;
    this.logger.log(`REST request to analyze balance: ${JSON.stringify(payload)}`, context);

    const result = await this.balanceService.maxBalance(payload);
    return {
      message: '',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<MaxBalanceResponseDto>;
  }
}
