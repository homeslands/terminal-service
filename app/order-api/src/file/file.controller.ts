import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Public } from '../auth/decorator/public.decorator';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileService } from './file.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppResponseDto } from 'src/app/app.dto';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { RoleEnum } from 'src/role/role.enum';
import { HasRoles } from 'src/role/roles.decorator';
import { S3Producer } from './s3/s3.producer';

@ApiBearerAuth()
@Controller('file')
@ApiTags('File')
export class FileController {
  constructor(
    private fileService: FileService,
    private s3Producer: S3Producer,
  ) {}

  @SkipThrottle()
  @Get(':filename')
  @Public()
  @ApiOperation({ summary: 'Get file by filename' })
  async getFile(@Param('filename') filename: string): Promise<StreamableFile> {
    const result = await this.fileService.getFile(filename);
    return new StreamableFile(result.data, {
      type: result.mimetype,
      length: result.size,
      disposition: `attachment; filename="${result.name}.${result.extension}"`,
    });
  }

  @Public()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload file' })
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    const result = await this.fileService.uploadFile(file);
    return {
      message: `File ${result} uploaded to S3 successfully`,
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
    } as AppResponseDto<void>;
  }

  @Throttle({ default: { limit: 1, ttl: 60000 } })
  @Post('migrate-to-s3')
  @HasRoles(RoleEnum.Admin, RoleEnum.SuperAdmin)
  @ApiOperation({ summary: 'Migrate file from database to S3' })
  async migrateToS3() {
    this.s3Producer.migrateFileFromDatabaseToS3();
    return {
      message: 'File migrated to S3 successfully',
      statusCode: HttpStatus.OK,
    } as AppResponseDto<void>;
  }
}
