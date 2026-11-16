import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ValidationPipe,
  HttpStatus,
  Query,
  HttpCode,
  Inject,
  Logger,
  StreamableFile,
} from '@nestjs/common';
import { CardOrderService } from './card-order.service';
import { CreateCardOrderDto } from './dto/create-card-order.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';
import { CardOrderResponseDto } from './dto/card-order-response.dto';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { FindAllCardOrderDto } from './dto/find-all-card-order.dto';
import { InitiateCardOrderPaymentAdminDto, InitiateCardOrderPaymentDto } from './dto/initiate-card-order-payment.dto';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { CurrentUser } from 'src/user/user.decorator';
import { CurrentUserDto } from 'src/user/user.dto';
import { HasRoles } from 'src/role/roles.decorator';
import { RoleEnum } from 'src/role/role.enum';

@Controller('card-order')
@ApiTags('Card Order Resource')
@ApiBearerAuth()
export class CardOrderController {
  constructor(
    private readonly cardOrderService: CardOrderService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
  ) { }

  @Get('/export/excel')
  @ApiOperation({ summary: 'Export all card order' })
  @HttpCode(HttpStatus.OK)
  async exportExcel(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: FindAllCardOrderDto,
  ): Promise<StreamableFile> {
    const context = `${CardOrderController.name}.${this.exportExcel.name}`;
    this.logger.log(`REST request to export Card Orders: ${JSON.stringify(query)}`, context);

    const result = await this.cardOrderService.exportExcel(query);

    return new StreamableFile(result.data, {
      type: 'application/vnd.ms-excel',
      length: result.size,
      disposition: `attachment; filename="${result.name}"`,
    });
  }

  @Post('/payment/initiate')
  @ApiOperation({ summary: 'Initiate a card order payment' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    type: CardOrderResponseDto,
  })
  async initiatePayment(
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
      }),
    )
    payload: InitiateCardOrderPaymentDto,
  ) {
    const context = `${CardOrderController.name}.${this.initiatePayment.name}`;
    this.logger.log(`REST request to initiate payment: ${JSON.stringify(payload)}`, context);

    const result = await this.cardOrderService.initiatePayment(payload);
    return {
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<CardOrderResponseDto>;
  }

  @Post('/payment/initiate/admin')
  // Buoc 5.1 (chot 16/11/2026): moi role tru Customer - dung dieu kien
  // `useInitiateCardOrderPayment` cua trend-ui/terminal-ui (`role !== CUSTOMER`
  // goi route nay). Truoc day khong co `@HasRoles` ⇒ khach cung goi duoc, ma
  // tra tien mat o day la cong xu ngay. `terminal` co them Cashier, Telesale.
  @HasRoles(
    RoleEnum.Staff,
    RoleEnum.Cashier,
    RoleEnum.Telesale,
    RoleEnum.Chef,
    RoleEnum.Manager,
    RoleEnum.Admin,
    RoleEnum.SuperAdmin,
  )
  @ApiOperation({ summary: 'Initiate a card order payment for admin' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    type: CardOrderResponseDto,
  })
  async initiatePaymentAdmin(
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
      }),
    )
    payload: InitiateCardOrderPaymentAdminDto,
  ) {
    const context = `${CardOrderController.name}.${this.initiatePaymentAdmin.name}`;
    this.logger.log(`REST request to init payment admin: ${JSON.stringify(payload)}`, context);

    const result = await this.cardOrderService.initiatePaymentAdmin(payload);
    return {
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<CardOrderResponseDto>;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new card order' })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    type: CardOrderResponseDto,
  })
  async create(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    createCardOrderDto: CreateCardOrderDto,
  ) {
    const context = `${CardOrderController.name}.${this.create.name}`;
    this.logger.log(`REST request to create Card Order: ${JSON.stringify(createCardOrderDto)}`, context);

    const result = await this.cardOrderService.create(createCardOrderDto);

    return {
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<CardOrderResponseDto>;
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve all card orders' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    type: CardOrderResponseDto,
    isArray: true,
  })
  async findAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    payload: FindAllCardOrderDto,
  ) {
    const context = `${CardOrderController.name}.${this.findAll.name}`;
    this.logger.log(`REST request to get all Card Orders: ${JSON.stringify(payload)}`, context);

    const result = await this.cardOrderService.findAll(payload);

    return {
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<CardOrderResponseDto>>;
  }

  @Get(':slug')
  async findOne(@Param('slug') slug: string) {
    const context = `${CardOrderController.name}.${this.findOne.name}`;
    this.logger.log(`REST request to find one card order: ${JSON.stringify(slug)}`, context);

    const result = await this.cardOrderService.findOne(slug);

    return {
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<CardOrderResponseDto>;
  }

  @Post(':slug/cancel')
  @ApiOperation({ summary: 'Cancel a card order' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    type: CardOrderResponseDto,
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(
    @Param('slug') slug: string,
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true })) user: CurrentUserDto) {
    const context = `${CardOrderController.name}.${this.cancel.name}`;
    this.logger.log(`REST request to cancel card order: ${JSON.stringify(slug)}`, context);

    await this.cardOrderService.cancel(slug, user);

    return {
      statusCode: HttpStatus.NO_CONTENT,
      timestamp: new Date().toISOString(),
    } as AppResponseDto<void>;
  }

  @Post(':slug/gift-card/gen')
  // Buoc 5.1 (chot 16/11/2026): route bam tay cong xu / phat hanh the - chi
  // quan tri. Hai UI khong co nut nao goi route nay.
  @HasRoles(RoleEnum.Manager, RoleEnum.Admin, RoleEnum.SuperAdmin)
  @ApiOperation({ summary: 'Generate and use gift cards' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    type: CardOrderResponseDto,
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async generateAndRedeem(@Param('slug') slug: string) {
    const context = `${CardOrderController.name}.${this.generateAndRedeem.name}`;
    this.logger.log(`REST request to generate and redeem: ${JSON.stringify(slug)}`, context);

    await this.cardOrderService.generateAndRedeem(slug);

    return {
      statusCode: HttpStatus.NO_CONTENT,
      timestamp: new Date().toISOString(),
    } as AppResponseDto<void>;
  }
}
