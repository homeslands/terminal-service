import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { UserService } from './user.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';
import {
  CompleteUserRegistrationRequestDto,
  CreateUserRequestDto,
  CurrentUserDto,
  GetAllUserQueryRequestDto,
  LookupRecipientQueryRequestDto,
  RecipientResponseDto,
  UpdateUserLanguageRequestDto,
  UpdateUserRequestDto,
  UpdateUserRoleRequestDto,
  UserResponseDto,
} from './user.dto';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { HasRoles } from 'src/role/roles.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { CurrentUser } from './user.decorator';
import { AuthProfileResponseDto } from 'src/auth/auth.dto';

@Controller('user')
@ApiTags('User')
@ApiBearerAuth()
export class UserController {
  constructor(private readonly userService: UserService) {}

  // F2 - route nay TUNG khong co `@HasRoles`. `RolesGuard` cho qua khi thieu
  // decorator (`if (_.isEmpty(requiredRoles)) return true;`), nen BAT KY tai
  // khoan dang nhap nao, ke ca `Customer`, cung list duoc toan bo nguoi dung
  // kem SDT / ho ten / email. Do tren moi truong song cua `trend` ngay
  // 12/09/2026 voi cung mot `roles.guard.ts`: token cua mot khach that goi ra
  // 200 + 916 khach.
  //
  // Sau khi lop 1 (sync-on-read) co mat, route nay con KICH HOAT mot lenh goi
  // sang `shared-user` - khach ep duoc terminal goi ra ngoai. Throttle chan
  // muc khuech dai, KHONG chan phan lo du lieu.
  //
  // ⛔ DANH SACH ROLE DUOI DAY LA CUA `terminal`, KHONG PHAI CUA `trend`.
  // `trend` co 6 role va khai `@HasRoles(Staff, Chef, Manager, Admin,
  // SuperAdmin)`. `terminal` co **8** role: chep nguyen danh sach cua `trend`
  // la KHOA THU NGAN (`Cashier`) VA `Telesale` RA KHOI O TIM KHACH O QUAY -
  // dung nhung nguoi dung route nay nhieu nhat. Quy tac: moi role TRU
  // `Customer`.
  //
  // Man KHACH mat duong tra nguoi nhan the qua vi phep gac nay - cua thay the
  // la `GET /user/lookup-recipient` ngay ben duoi (QD16-bis).
  @Get()
  @HasRoles(
    RoleEnum.Staff,
    RoleEnum.Cashier,
    RoleEnum.Chef,
    RoleEnum.Manager,
    RoleEnum.Admin,
    RoleEnum.SuperAdmin,
    RoleEnum.Telesale,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retrieve all user' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'All users have been retrieved successfully',
    type: UserResponseDto,
    isArray: true,
  })
  async getAllUsers(
    @Query(new ValidationPipe({ transform: true }))
    query: GetAllUserQueryRequestDto,
  ): Promise<AppResponseDto<AppPaginatedResponseDto<UserResponseDto>>> {
    const result = await this.userService.getAllUsers(query);
    return {
      message: 'All users have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<UserResponseDto>>;
  }

  /**
   * QD16-bis - cua HEP tra NGUOI NHAN the qua theo SDT, thay cho `GET /user`
   * o man KHACH (route do vua bi gac va khong nhan `Customer`).
   *
   * `@HasRoles` o day co DU CA 8 ROLE, gom `Customer`: day chinh la duong
   * danh cho khach. Ho chi thay toi da 1 nguoi va dung 4 field.
   *
   * ⚠ Phai khai TRUOC `@Get(':slug')` - khong thi Nest bat `lookup-recipient`
   * vao tham so `:slug`.
   */
  @Get('lookup-recipient')
  @HasRoles(
    RoleEnum.Customer,
    RoleEnum.Staff,
    RoleEnum.Cashier,
    RoleEnum.Chef,
    RoleEnum.Manager,
    RoleEnum.Admin,
    RoleEnum.SuperAdmin,
    RoleEnum.Telesale,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lookup a gift-card recipient by exact phonenumber' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Recipient has been retrieved successfully',
    type: RecipientResponseDto,
    isArray: true,
  })
  async lookupRecipient(
    @Query(new ValidationPipe({ transform: true }))
    query: LookupRecipientQueryRequestDto,
  ): Promise<AppResponseDto<RecipientResponseDto[]>> {
    const result = await this.userService.lookupRecipient(query);
    return {
      message: 'Recipient has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<RecipientResponseDto[]>;
  }

  @Post()
  @HasRoles(
    RoleEnum.Staff,
    RoleEnum.Cashier,
    RoleEnum.Manager,
    RoleEnum.Admin,
    RoleEnum.SuperAdmin,
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create user' })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'User has been created successfully',
    type: UserResponseDto,
  })
  async createUser(
    @Body(new ValidationPipe({ transform: true }))
    requestData: CreateUserRequestDto,
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    user: CurrentUserDto,
  ): Promise<AppResponseDto<UserResponseDto>> {
    const result = await this.userService.createUser(
      requestData,
      user?.scope?.role,
    );
    return {
      message: 'User has been created successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<UserResponseDto>;
  }

  @Post(':slug/reset-password')
  @HasRoles(RoleEnum.Manager, RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset pwd' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'User password has been reset successfully',
    type: UserResponseDto,
  })
  async resetPassword(
    @Param('slug') slug: string,
  ): Promise<AppResponseDto<UserResponseDto>> {
    await this.userService.resetPassword(slug);
    return {
      message: 'User password has been reset successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
    } as AppResponseDto<UserResponseDto>;
  }

  @Post(':slug/role')
  @HasRoles(RoleEnum.Manager, RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update user role' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'User role have been updated successfully',
    type: UserResponseDto,
  })
  async updateUserRole(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true }))
    requestData: UpdateUserRoleRequestDto,
  ) {
    const result = await this.userService.updateUserRole(slug, requestData);
    return {
      message: 'User role has been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<UserResponseDto>;
  }

  @Patch(':slug')
  @HasRoles(RoleEnum.Manager, RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update user' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'User info have been updated successfully',
    type: UserResponseDto,
  })
  async updateUser(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true }))
    requestData: UpdateUserRequestDto,
  ) {
    const result = await this.userService.updateUser(slug, requestData);
    return {
      message: 'User has been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<UserResponseDto>;
  }

  @Patch(':slug/complete-registration')
  @HasRoles(
    RoleEnum.Staff,
    RoleEnum.Cashier,
    RoleEnum.Manager,
    RoleEnum.Admin,
    RoleEnum.SuperAdmin,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete user registration' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'User registration has been completed successfully',
    type: UserResponseDto,
  })
  async completeUserRegistration(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true }))
    requestData: CompleteUserRegistrationRequestDto,
  ) {
    await this.userService.completeUserRegistration(slug, requestData);
    return {
      message: 'User registration has been completed successfully',
      statusCode: HttpStatus.NO_CONTENT,
      timestamp: new Date().toISOString(),
    } as AppResponseDto<void>;
  }

  @Get(':slug')
  @HasRoles(RoleEnum.SuperAdmin, RoleEnum.Admin, RoleEnum.Manager)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retrieve user by slug' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'User has been retrieved successfully',
    type: UserResponseDto,
  })
  async getUserBySlug(
    @Param('slug') slug: string,
  ): Promise<AppResponseDto<UserResponseDto>> {
    const result = await this.userService.getUserBySlug(slug);
    return {
      message: 'User has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<UserResponseDto>;
  }

  @Patch(':slug/toggle-active')
  @HasRoles(RoleEnum.SuperAdmin, RoleEnum.Admin, RoleEnum.Manager)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle user active status' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'User active status has been toggled successfully',
    type: UserResponseDto,
  })
  async toggleActiveUser(
    @Param('slug') slug: string,
  ): Promise<AppResponseDto<UserResponseDto>> {
    const result = await this.userService.toggleActiveUser(slug);
    return {
      message: 'User active status has been toggled successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<UserResponseDto>;
  }

  @Patch(':slug/language')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update user language' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'User language has been updated successfully',
    type: AuthProfileResponseDto,
  })
  async updateUserLanguage(
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    currentUserDto: CurrentUserDto,
    @Body(new ValidationPipe({ transform: true }))
    requestData: UpdateUserLanguageRequestDto,
  ): Promise<AppResponseDto<AuthProfileResponseDto>> {
    const result = await this.userService.updateUserLanguage(
      currentUserDto.userId,
      requestData,
    );
    return {
      message: 'User language has been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AuthProfileResponseDto>;
  }
}
