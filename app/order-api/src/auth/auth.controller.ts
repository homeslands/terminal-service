import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthProfileResponseDto } from './auth.dto';
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

// Buoc 3.2: SAU route xac minh email/SDT da xoa khoi `terminal` (ban that o
// `shared-user`, `terminal-ui` goi qua `httpAuth` - `api/auth.ts`). Controller
// nay chi con hai route doc: `GET /auth/profile` va `GET /auth/scope` - ca hai
// GIU NGUYEN shape cu (muc 1.4). Vi khong con route `@Post` nao, cac import
// `Body`, `Post`, `Throttle` va nam DTO xac minh cung roi theo.

@ApiTags('Authentication')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

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
