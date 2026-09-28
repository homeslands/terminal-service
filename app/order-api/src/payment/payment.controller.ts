import {
  Controller,
  Post,
  Body,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  Query,
  Get,
  Param,
  StreamableFile,
  Put,
  UseGuards,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreatePaymentCallbackRouteRequestDto,
  CreatePaymentDto,
  GetPaymentBankingBackupRequestDto,
  GetPaymentCallbackForwardLogRequestDto,
  GetSpecificPaymentRequestDto,
  PaymentBankingBackupResponseDto,
  PaymentCallbackForwardLogResponseDto,
  PaymentCallbackRouteResponseDto,
  PaymentResponseDto,
  RetrieveQrTransactionRequestDto,
  UpdatePaymentCallbackRouteRequestDto,
} from './payment.dto';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';
import { Public } from 'src/auth/decorator/public.decorator';
import {
  ACBQrTransactionNotificationRequestDto,
  ACBRetrieveQRCodeResponseBodyDto,
  ACBStatusRequestDto,
} from 'src/acb-connector/acb-connector.dto';
import { Throttle } from '@nestjs/throttler';
import { CurrentUserDto } from 'src/user/user.dto';
import { CurrentUser } from 'src/user/user.decorator';
import { ConfigService } from '@nestjs/config';
import { PaymentException } from './payment.exception';
import { HasRoles } from 'src/role/roles.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { ApiKeyGuard } from './guard/api-key.guard';

@ApiTags('Payment')
@ApiBearerAuth()
@Controller('payment')
export class PaymentController {
  private NODE_ENV = this.configService.get('NODE_ENV');
  private isProd = this.NODE_ENV === 'production';

  constructor(
    private readonly paymentService: PaymentService,
    private readonly configService: ConfigService,
  ) {}

  @Get('specific')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate payment' })
  @ApiQuery({
    name: 'transaction',
    required: true,
    type: String,
  })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Payment has been retrieved successfully',
    type: PaymentResponseDto,
    isArray: true,
  })
  async getSpecific(
    @Query(new ValidationPipe({ transform: true }))
    query: GetSpecificPaymentRequestDto,
  ) {
    const result = await this.paymentService.getSpecific(query);
    return {
      message: 'Payment has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<PaymentResponseDto>;
  }

  @Post('initiate')
  @HasRoles(
    RoleEnum.Customer,
    RoleEnum.Cashier,
    RoleEnum.Manager,
    RoleEnum.Admin,
    RoleEnum.SuperAdmin,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate payment' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Payment has been initiated successfully',
    type: PaymentResponseDto,
    isArray: true,
  })
  async initiate(
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    user: CurrentUserDto,
    @Body(new ValidationPipe({ transform: true }))
    createPaymentDto: CreatePaymentDto,
  ) {
    const result = await this.paymentService.initiate(createPaymentDto, user);
    return {
      message: 'Payment has been initiated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<PaymentResponseDto>;
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('initiate/public')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate payment public' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Payment has been initiated successfully',
    type: PaymentResponseDto,
    isArray: true,
  })
  async initiatePublic(
    @Body(new ValidationPipe({ transform: true }))
    createPaymentDto: CreatePaymentDto,
  ) {
    const result = await this.paymentService.initiatePublic(createPaymentDto);
    return {
      message: 'Payment has been initiated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<PaymentResponseDto>;
  }

  @Get('qr-transaction/retrieve')
  @HasRoles(RoleEnum.Manager, RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retrieve QR transactions from ACB' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'QR transactions have been retrieved successfully',
    type: ACBRetrieveQRCodeResponseBodyDto,
  })
  async retrieveQrTransactions(
    @Query(new ValidationPipe({ transform: true }))
    query: RetrieveQrTransactionRequestDto,
  ) {
    const result = await this.paymentService.retrieveQrTransactions(query);
    return {
      message: 'QR transactions have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ACBRetrieveQRCodeResponseBodyDto>;
  }

  @Get('banking-backup')
  @HasRoles(RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retrieve payment banking backup records' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description:
      'Payment banking backup records have been retrieved successfully',
    type: PaymentBankingBackupResponseDto,
    isArray: true,
  })
  async getPaymentBankingBackups(
    @Query(new ValidationPipe({ transform: true }))
    query: GetPaymentBankingBackupRequestDto,
  ) {
    const result = await this.paymentService.getPaymentBankingBackups(query);
    return {
      message:
        'Payment banking backup records have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<
      AppPaginatedResponseDto<PaymentBankingBackupResponseDto>
    >;
  }

  @Post('callback/status')
  @Public()
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Callback' })
  // @ApiResponseWithType({
  //   status: HttpStatus.OK,
  //   description: 'Callback has been processed successfully',
  //   type: PaymentResponseDto,
  // })
  async callback(
    @Body(new ValidationPipe({ transform: true }))
    requestData: ACBStatusRequestDto,
  ) {
    const result = await this.paymentService.callback(requestData);
    return result;
  }

  @Get('callback/route')
  @HasRoles(RoleEnum.Manager, RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get payment callback routes' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Payment callback routes have been retrieved successfully',
    type: PaymentCallbackRouteResponseDto,
    isArray: true,
  })
  async getCallbackRoutes() {
    const result = await this.paymentService.getCallbackRoutes();
    return {
      message: 'Payment callback routes have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<PaymentCallbackRouteResponseDto[]>;
  }

  @Post('callback/route')
  @HasRoles(RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create payment callback route' })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'Payment callback route has been created successfully',
    type: PaymentCallbackRouteResponseDto,
  })
  async createCallbackRoute(
    @Body(new ValidationPipe({ transform: true }))
    requestData: CreatePaymentCallbackRouteRequestDto,
  ) {
    const result = await this.paymentService.createCallbackRoute(requestData);
    return {
      message: 'Payment callback route has been created successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<PaymentCallbackRouteResponseDto>;
  }

  @Put('callback/route/:slug')
  @HasRoles(RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update payment callback route' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Payment callback route has been updated successfully',
    type: PaymentCallbackRouteResponseDto,
  })
  async updateCallbackRoute(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true }))
    requestData: UpdatePaymentCallbackRouteRequestDto,
  ) {
    const result = await this.paymentService.updateCallbackRoute(
      slug,
      requestData,
    );
    return {
      message: 'Payment callback route has been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<PaymentCallbackRouteResponseDto>;
  }

  @Get('callback/forward-log')
  @HasRoles(RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retrieve payment callback forward logs' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description:
      'Payment callback forward logs have been retrieved successfully',
    type: PaymentCallbackForwardLogResponseDto,
    isArray: true,
  })
  async getCallbackForwardLogs(
    @Query(new ValidationPipe({ transform: true }))
    query: GetPaymentCallbackForwardLogRequestDto,
  ) {
    const result = await this.paymentService.getCallbackForwardLogs(query);
    return {
      message: 'Payment callback forward logs have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<
      AppPaginatedResponseDto<PaymentCallbackForwardLogResponseDto>
    >;
  }

  @Post('callback/qr-transaction')
  @Public()
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive QR transaction notification list from ACB',
  })
  async qrTransactionNotification(
    @Body(new ValidationPipe({ transform: true }))
    requestData: ACBQrTransactionNotificationRequestDto,
  ) {
    const result =
      await this.paymentService.qrTransactionNotification(requestData);
    return result;
  }

  @Post(':slug/export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Export payment' })
  async exportPayment(@Param('slug') slug: string) {
    const result = await this.paymentService.exportPayment(slug);
    return new StreamableFile(result, {
      type: 'application/pdf',
      length: result.length,
      disposition: `attachment; filename="payment-${new Date().toISOString()}.pdf"`,
    });
  }

  @Post(':slug/export/auto')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Auto print payment to branch printer' })
  async autoPrintPayment(@Param('slug') slug: string) {
    this.paymentService.autoPrintPayment(slug);
    return {
      message: 'Print job sent successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
    };
  }

  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @Post(':slug/export/public')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Export payment public' })
  async exportPaymentPublic(@Param('slug') slug: string) {
    const result = await this.paymentService.exportPayment(slug);
    return new StreamableFile(result, {
      type: 'application/pdf',
      length: result.length,
      disposition: `attachment; filename="payment-${new Date().toISOString()}.pdf"`,
    });
  }

  @Put(':slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update payment' })
  @ApiExcludeEndpoint(process.env.NODE_ENV === 'production')
  async update(@Param('slug') slug: string) {
    if (this.isProd)
      throw new PaymentException(
        HttpStatus.FORBIDDEN,
        'This endpoint is not available in this environment',
      );

    await this.paymentService.update(slug);
    return {
      statusCode: HttpStatus.NO_CONTENT,
      timestamp: new Date().toISOString(),
    } as AppResponseDto<void>;
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retrieve payments' })
  async getAll() {
    const result = await this.paymentService.getAll();
    return {
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<PaymentResponseDto[]>;
  }
}
