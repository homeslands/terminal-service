import {
  Body,
  Param,
  Query,
  ValidationPipe,
  UploadedFile,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import { CardService } from './card.service';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { FindAllCardDto } from './dto/find-all-card.dto';
import { CardResponseDto } from './dto/card-response.dto';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  DeleteCardApi,
  GetAllCardsApi,
  GetCardBySlugApi,
  PatchUpdateCardApi,
  PostCreateCardApi
} from './card.swagger';
import { RestController } from 'src/shared/decorators/rest-controller.decorator';

@RestController({ path: 'card', tags: ['Card Resources'] })
export class CardController {
  constructor(
    private readonly cardService: CardService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
  ) { }

  @PostCreateCardApi({ path: '' })
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    createCardDto: CreateCardDto,
  ) {
    const context = `${CardController.name}.${this.create.name}`;
    this.logger.log(
      `REST request to create card: ${JSON.stringify(createCardDto)}`, context
    );
    const result = await this.cardService.create(createCardDto, file);
    return {
      message: 'The new card was created successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<CardResponseDto>;
  }

  @GetAllCardsApi({ path: '' })
  async findAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: FindAllCardDto,
  ) {
    const context = `${CardController.name}.${this.findAll.name}`;
    this.logger.log(
      `REST request to find all cards: ${JSON.stringify(query)}`, context
    );
    const result = await this.cardService.findAll(query);
    return {
      message: 'The cards were fetched successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<CardResponseDto>>;
  }

  @GetCardBySlugApi({ path: ':slug' })
  async findOne(@Param('slug') slug: string) {
    const context = `${CardController.name}.${this.findOne.name}`;
    this.logger.log(
      `REST request to find card by slug: ${JSON.stringify(slug)}`, context
    );
    const result = await this.cardService.findOne(slug);
    return {
      message: 'The card was fetched successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<CardResponseDto>;
  }

  @PatchUpdateCardApi({ path: ':slug' })
  async update(
    @Param('slug') slug: string,
    @UploadedFile() file: Express.Multer.File,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    updateCardDto: UpdateCardDto,
  ) {
    const context = `${CardController.name}.${this.update.name}`;
    this.logger.log(
      `REST request to update card: ${JSON.stringify(updateCardDto)}`, context
    );
    const result = await this.cardService.update(slug, file, updateCardDto);
    return {
      message: 'The card was updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<CardResponseDto>;
  }

  @DeleteCardApi({ path: ':slug' })
  async remove(@Param('slug') slug: string) {
    const context = `${CardController.name}.${this.remove.name}`;
    this.logger.log(
      `REST request to soft-remove card: ${JSON.stringify(slug)}`, context
    );
    const result = await this.cardService.remove(slug);
    return {
      message: 'The card was deleted successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<CardResponseDto>;
  }
}
