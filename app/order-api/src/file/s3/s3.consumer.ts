import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueRegisterKey } from 'src/app/app.constants';
import { S3Service } from './s3.service';
import { MIGRATE_FILE_FROM_DATABASE_TO_S3_JOB } from './s3.constants';

@Processor(QueueRegisterKey.MIGRATE_FILE_FROM_DATABASE_TO_S3)
@Injectable()
export class S3Consumer extends WorkerHost {
  constructor(private readonly s3Service: S3Service) {
    super();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async process(job: Job<void>, token?: string): Promise<any> {
    switch (job.name) {
      case MIGRATE_FILE_FROM_DATABASE_TO_S3_JOB:
        const result = await this.s3Service.migrateFileFromDatabaseToS3();

        return result;
    }
  }
}
