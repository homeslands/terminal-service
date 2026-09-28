import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { File } from '../file.entity';
import pLimit from 'p-limit';

@Injectable()
export class S3Service {
  private readonly BATCH_SIZE = 20;
  private s3: S3Client;
  private readonly AWS_REGION: string;
  private readonly AWS_ACCESS_KEY_ID: string;
  private readonly AWS_SECRET_ACCESS_KEY: string;
  private readonly AWS_BUCKET: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    @InjectRepository(File)
    private readonly fileRepository: Repository<File>,
  ) {
    this.AWS_REGION = this.configService.get<string>('AWS_REGION');
    this.AWS_ACCESS_KEY_ID =
      this.configService.get<string>('AWS_ACCESS_KEY_ID');
    this.AWS_SECRET_ACCESS_KEY = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );
    this.AWS_BUCKET = this.configService.get<string>('AWS_BUCKET');

    this.s3 = new S3Client({
      region: this.AWS_REGION,
      credentials: {
        accessKeyId: this.AWS_ACCESS_KEY_ID,
        secretAccessKey: this.AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  async migrateFileFromDatabaseToS3() {
    const context = `${S3Service.name}.${this.migrateFileFromDatabaseToS3.name}`;

    let offset = 0;
    let total = 0;

    const limit = pLimit(20);

    while (true) {
      const files = await this.fileRepository.find({
        order: { id: 'ASC' },
        skip: offset,
        take: this.BATCH_SIZE,
      });

      if (!files.length) {
        this.logger.log(
          `Migration file from database to S3 finished. Total uploaded: ${total}`,
          context,
        );
        break;
      }

      const tasks = files.map((file) =>
        limit(async () => {
          try {
            await this.s3.send(
              new PutObjectCommand({
                Bucket: this.AWS_BUCKET,
                Key: file.name,
                Body: Buffer.from(file.data, 'base64'),
                ContentType: file.mimetype,
              }),
            );

            return { success: true, file };
          } catch (err) {
            this.logger.error(
              `Failed when uploading file ${file.id}`,
              err.stack,
              context,
            );
            return { success: false, file, err };
          }
        }),
      );

      const results = await Promise.allSettled(tasks);

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const r = result.value;

          if (r.success) {
            total++;

            if (total % 50 === 0) {
              this.logger.log(`Uploaded ${total} files`, context);
            }
          } else {
            this.logger.error(`Failed file ${r.file.id}`, r.err, context);
          }
        } else {
          this.logger.error(`Unexpected error`, result.reason, context);
        }
      }

      offset += this.BATCH_SIZE;
    }
  }

  async uploadFile(file: Express.Multer.File): Promise<string> {
    const context = `${S3Service.name}.${this.uploadFile.name}`;
    const filename = file.originalname.split('.')[0].replace(' ', '-');
    const key = `${filename}-${Date.now()}.${file.originalname.split('.')[1]}`;
    // const key = `${filename}-${Date.now()}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.AWS_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    this.logger.log(`File ${file.originalname} uploaded to S3`, context);

    return key;
  }

  async uploadFiles(files: Express.Multer.File[]): Promise<string[]> {
    const uploads = files.map(async (file) => {
      const filename = file.originalname.split('.')[0].replace(' ', '-');
      const key = `${filename}-${Date.now()}.${file.originalname.split('.')[1]}`;
      // const key = `${filename}-${Date.now()}`;

      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.AWS_BUCKET,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );

      return key;
    });

    return Promise.all(uploads);
  }

  async deleteFile(key: string): Promise<void> {
    const context = `${S3Service.name}.${this.deleteFile.name}`;
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.AWS_BUCKET,
        Key: key,
      }),
    );
    this.logger.log(`File ${key} deleted from S3`, context);
  }
}
