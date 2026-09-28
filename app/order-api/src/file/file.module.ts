import { Global, Module } from '@nestjs/common';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { File } from './file.entity';
import { FileProfile } from './file.mapper';
import { S3Service } from './s3/s3.service';
import { S3Producer } from './s3/s3.producer';
import { S3Consumer } from './s3/s3.consumer';
import { BullModule } from '@nestjs/bullmq';
import { QueueRegisterKey } from 'src/app/app.constants';
import { ConfigModule } from '@nestjs/config';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([File]),
    ConfigModule,
    BullModule.registerQueue({
      name: QueueRegisterKey.MIGRATE_FILE_FROM_DATABASE_TO_S3,
    }),
  ],
  controllers: [FileController],
  providers: [FileService, FileProfile, S3Service, S3Producer, S3Consumer],
  exports: [FileService, S3Service],
})
export class FileModule {}
