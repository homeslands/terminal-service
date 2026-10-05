import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  AuthProfileResponseDto,
  InitiateVerifyEmailRequestDto,
  ConfirmEmailVerificationCodeRequestDto,
  VerifyEmailResponseDto,
  VerifyPhoneNumberResponseDto,
  ConfirmPhoneNumberVerificationCodeRequestDto,
} from './auth.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AppResponseDto } from 'src/app/app.dto';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { CurrentUser } from '../user/user.decorator';
import { CurrentUserDto, UserScopeDto } from 'src/user/user.dto';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Authentication')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}
  @HttpCode(HttpStatus.OK)
  @Post('initiate-verify-email')
  @ApiOperation({ summary: 'Initiate verify email' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiResponseWithType({
    type: VerifyEmailResponseDto,
    description: 'Initiate verify email successful',
  })
  async initiateVerifyEmail(
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    user: CurrentUserDto,
    @Body(new ValidationPipe({ transform: true }))
    requestData: InitiateVerifyEmailRequestDto,
  ) {
    const result = await this.authService.initiateVerifyEmail(
      user,
      requestData,
    );
    const response = {
      message: 'Initiate verify email successful',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<VerifyEmailResponseDto>;
    return response;
  }

  @Throttle({ default: { limit: 1, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Post('resend-verify-email')
  @ApiOperation({ summary: 'Resend verify email' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiResponseWithType({
    type: VerifyEmailResponseDto,
    description: 'Resend verify email code successful',
  })
  async resendVerifyEmailCode(
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    user: CurrentUserDto,
  ) {
    const result = await this.authService.resendVerifyEmailCode(user);
    const response = {
      message: 'Resend verify email code successful',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<VerifyEmailResponseDto>;
    return response;
  }

  @HttpCode(HttpStatus.OK)
  @Post('confirm-email-verification/code')
  @ApiOperation({ summary: 'Confirm email verification' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiResponseWithType({
    type: String,
    description: 'Confirm email verification successful',
  })
  async confirmVerifyEmailCode(
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    user: CurrentUserDto,
    @Body(new ValidationPipe({ transform: true }))
    requestData: ConfirmEmailVerificationCodeRequestDto,
  ) {
    await this.authService.confirmEmailVerificationCode(user, requestData);
    const response = {
      message: 'Confirm email verification successful',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result: 'Confirm email verification successful',
    } as AppResponseDto<string>;
    return response;
  }

  @HttpCode(HttpStatus.OK)
  @Post('initiate-verify-phone-number')
  @ApiOperation({ summary: 'Initiate verify phone number' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiResponseWithType({
    type: VerifyPhoneNumberResponseDto,
    description: 'Initiate verify phone number successful',
  })
  async initiateVerifyPhoneNumber(
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    user: CurrentUserDto,
  ) {
    const result = await this.authService.initiateVerifyPhoneNumber(user);
    const response = {
      message: 'Initiate verify phone number successful',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<VerifyPhoneNumberResponseDto>;
    return response;
  }

  @Throttle({ default: { limit: 2, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Post('resend-verify-phone-number')
  @ApiOperation({ summary: 'Resend verify phone number' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiResponseWithType({
    type: VerifyPhoneNumberResponseDto,
    description: 'Resend verify phone number code successful',
  })
  async resendVerifyPhoneNumberCode(
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    user: CurrentUserDto,
  ) {
    const result = await this.authService.resendVerifyPhoneNumberCode(user);
    const response = {
      message: 'Resend verify phone number code successful',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<VerifyPhoneNumberResponseDto>;
    return response;
  }

  @HttpCode(HttpStatus.OK)
  @Post('confirm-phone-number-verification/code')
  @ApiOperation({ summary: 'Confirm phone number verification' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiResponseWithType({
    type: String,
    description: 'Confirm phone number verification successful',
  })
  async confirmVerifyPhoneNumberCode(
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    user: CurrentUserDto,
    @Body(new ValidationPipe({ transform: true }))
    requestData: ConfirmPhoneNumberVerificationCodeRequestDto,
  ) {
    await this.authService.confirmPhoneNumberVerificationCode(
      user,
      requestData,
    );
    const response = {
      message: 'Confirm phone number verification successful',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result: 'Confirm phone number verification successful',
    } as AppResponseDto<string>;
    return response;
  }

  @HttpCode(HttpStatus.OK)
  @Get('profile')
  @ApiOperation({ summary: 'Get profile' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiResponseWithType({
    type: AuthProfileResponseDto,
    description: 'Profile retrieved successful',
  })
  async getProfile(
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    user: CurrentUserDto,
  ): Promise<AppResponseDto<AuthProfileResponseDto>> {
    const result = await this.authService.getProfile(user);
    return {
      message: 'Profile retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AuthProfileResponseDto>;
  }

  /**
   * Nguon quyen DUY NHAT cua UI sau cutover.
   *
   * Vi sao phai co route nay chu khong doc tu token: JWT do `shared-user` ky
   * co dung ba field `{ sub, jti, exp }` - **khong co `scope`**. Role va
   * permission la nghiep vu RIENG cua `terminal` (QD15), `shared-user` khong
   * biet va khong duoc biet.
   *
   * `scope` da duoc `JwtStrategy` dung lai TU DB tren chinh request nay, nen
   * day chi la mot phep doc, khong ton them truy van nao.
   *
   * Tra `{ role, permissions, branch }`. `branch` di kem vi UI can no de dieu
   * huong/loc, va no la du lieu cuc bo cua `terminal` - lay tu `GET
   * /auth/profile` cung duoc nhung the thi UI phai ghep hai nguon.
   */
  @HttpCode(HttpStatus.OK)
  @Get('scope')
  @ApiOperation({
    summary: 'Get current user role and authority (permissions)',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiResponseWithType({
    type: UserScopeDto,
    description: 'Scope retrieved successful',
  })
  async getScope(
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    user: CurrentUserDto,
  ): Promise<AppResponseDto<UserScopeDto>> {
    return {
      message: 'Scope retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result: user.scope,
    } as AppResponseDto<UserScopeDto>;
  }

  // ==========================================================================
  // NHOM ROUTE DA XOA KHOI `terminal` (giai doan 1 - cutover auth/identity)
  //
  // POST   /auth/login
  // POST   /auth/register, /register/initiate, /register/resend,
  //        /register/complete
  // POST   /auth/refresh
  // POST   /auth/change-password
  // POST   /auth/forgot-password, /forgot-password/{initiate,resend,confirm,change}
  // DELETE /auth/delete-account
  // PATCH  /auth/profile, PATCH /auth/upload
  //
  // Tat ca thuoc ve `shared-user` (identity service): client goi THANG sang
  // cac endpoint tuong ung ben do. Xoa route ma de method o `auth.service.ts`
  // song la DE LAI DUONG KY JWT - nen cac method tuong ung cung da bi go.
  //
  // 6 route `verify-email` / `verify-phone-number` GIU TAM o day, se chuyen o
  // giai doan sau. `GET /auth/profile` GIU HAN: no ghep identity
  // (shared-user) voi role/branch (terminal) - mot hanh dong, mot lenh goi,
  // UI khong ghep ho (architect-http.md muc 1.1 quy tac 4).
  // ==========================================================================
}
