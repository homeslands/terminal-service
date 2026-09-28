import { Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { MembershipCardService } from './membership-card.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  BulkCreateMembershipCardDto,
  CreateMembershipCardDto,
  MembershipCardResponseDto,
  ReplaceMembershipCardDto,
} from './membership-card.dto';
import { AppResponseDto } from 'src/app/app.dto';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { HttpCode, HttpStatus, Body, ValidationPipe } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { CurrentUserDto } from 'src/user/user.dto';
import { CurrentUser } from 'src/user/user.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { HasRoles } from 'src/role/roles.decorator';

@Controller('membership-card')
@ApiTags('Membership Card')
@ApiBearerAuth()
export class MembershipCardController {
  constructor(private readonly membershipCardService: MembershipCardService) {}

  @Post()
  @HasRoles(
    RoleEnum.Cashier,
    RoleEnum.Manager,
    RoleEnum.Admin,
    RoleEnum.SuperAdmin,
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new membership card' })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'The new membership card was created successfully',
    type: MembershipCardResponseDto,
  })
  async createMembershipCard(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: CreateMembershipCardDto,
  ) {
    const result =
      await this.membershipCardService.createMembershipCard(requestData);
    return {
      message: 'The new membership card was created successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<MembershipCardResponseDto>;
  }

  @Post('bulk')
  @HasRoles(RoleEnum.Manager, RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Bulk create membership card' })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'The new membership cards were created successfully',
    type: MembershipCardResponseDto,
  })
  async bulkCreateMembershipCard(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: BulkCreateMembershipCardDto,
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    user: CurrentUserDto,
  ) {
    const result = await this.membershipCardService.bulkCreateMembershipCard(
      user.userId,
      requestData,
    );
    return {
      message: 'The new membership cards were created successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<MembershipCardResponseDto[]>;
  }

  @HasRoles(
    RoleEnum.Cashier,
    RoleEnum.Manager,
    RoleEnum.Admin,
    RoleEnum.SuperAdmin,
  )
  @Patch('user/:slug/toggle-active')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle active membership card' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description:
      'The membership card active status has been toggled successfully',
    type: MembershipCardResponseDto,
  })
  async toggleActiveMembershipCard(@Param('slug') slug: string) {
    const result =
      await this.membershipCardService.toggleActiveMembershipCard(slug);
    return {
      message:
        'The membership card active status has been toggled successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<MembershipCardResponseDto>;
  }

  @HasRoles(
    RoleEnum.Cashier,
    RoleEnum.Manager,
    RoleEnum.Admin,
    RoleEnum.SuperAdmin,
  )
  @Patch('replace')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Replace membership card' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'The membership card was replaced successfully',
    type: MembershipCardResponseDto,
  })
  async replaceMembershipCard(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: ReplaceMembershipCardDto,
  ) {
    const result =
      await this.membershipCardService.replaceMembershipCard(requestData);
    return {
      message: 'The membership card was replaced successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<MembershipCardResponseDto>;
  }

  @HasRoles(
    RoleEnum.Cashier,
    RoleEnum.Manager,
    RoleEnum.Admin,
    RoleEnum.SuperAdmin,
  )
  @Delete('user/:slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete membership card' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'The membership card was deleted successfully',
    type: String,
  })
  async deleteMembershipCard(@Param('slug') slug: string) {
    await this.membershipCardService.deleteMembershipCard(slug);
    return {
      message: 'The membership card was deleted successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result: `1 membership card was deleted successfully`,
    } as AppResponseDto<string>;
  }
}
