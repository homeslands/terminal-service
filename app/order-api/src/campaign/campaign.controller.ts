import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { Public } from 'src/auth/decorator/public.decorator';
import { HasRoles } from 'src/role/roles.decorator';
import { RoleEnum } from 'src/role/role.enum';
import {
  CampaignKeyResponseDto,
  CampaignResponseDto,
  CreateCampaignRequestDto,
  GetAllCampaignQueryRequestDto,
  UpdateCampaignRequestDto,
} from './campaign.dto';
import { CampaignService } from './campaign.service';

@Controller('campaign')
@ApiBearerAuth()
@ApiTags('Campaign')
export class CampaignController {
  constructor(private readonly campaignService: CampaignService) {}

  @Get('keys')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all campaign type keys' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Campaign keys retrieved successfully',
    type: CampaignKeyResponseDto,
    isArray: true,
  })
  getAllCampaignKeys() {
    const result = this.campaignService.getAllCampaignKeys();
    return {
      message: 'Campaign keys retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<CampaignKeyResponseDto[]>;
  }

  @Post()
  @HasRoles(RoleEnum.Manager, RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new campaign' })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'Campaign has been created successfully',
    type: CampaignResponseDto,
  })
  async create(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: CreateCampaignRequestDto,
  ) {
    const result = await this.campaignService.create(dto);
    return {
      message: 'Campaign has been created successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<CampaignResponseDto>;
  }

  @Get()
  @HasRoles(RoleEnum.Manager, RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all campaigns' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Campaigns retrieved successfully',
    type: CampaignResponseDto,
    isArray: true,
  })
  async findAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetAllCampaignQueryRequestDto,
  ) {
    const result = await this.campaignService.findAll(query);
    return {
      message: 'Campaigns retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<CampaignResponseDto>>;
  }

  @Get(':slug')
  @HasRoles(RoleEnum.Manager, RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get campaign by slug' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Campaign retrieved successfully',
    type: CampaignResponseDto,
  })
  async findOne(@Param('slug') slug: string) {
    const result = await this.campaignService.findOne(slug);
    return {
      message: 'Campaign retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<CampaignResponseDto>;
  }

  @Patch(':slug')
  @HasRoles(RoleEnum.Manager, RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update campaign by slug' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Campaign has been updated successfully',
    type: CampaignResponseDto,
  })
  async update(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: UpdateCampaignRequestDto,
  ) {
    const result = await this.campaignService.update(slug, dto);
    return {
      message: 'Campaign has been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<CampaignResponseDto>;
  }

  @Delete(':slug')
  @HasRoles(RoleEnum.Manager, RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete campaign by slug' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Campaign has been deleted successfully',
    type: CampaignResponseDto,
  })
  async delete(@Param('slug') slug: string) {
    await this.campaignService.delete(slug);
    return {
      message: 'Campaign has been deleted successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
    } as AppResponseDto<void>;
  }
}
