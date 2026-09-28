import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QueueRegisterKey } from 'src/app/app.constants';
import { MIGRATE_FILE_FROM_DATABASE_TO_S3_JOB } from './s3.constants';

@Injectable()
export class S3Producer {
  constructor(
    @InjectQueue(QueueRegisterKey.MIGRATE_FILE_FROM_DATABASE_TO_S3)
    private s3Queue: Queue,
  ) {}

  async migrateFileFromDatabaseToS3() {
    this.s3Queue.add(
      MIGRATE_FILE_FROM_DATABASE_TO_S3_JOB,
      {},
      {
        attempts: 3,
        backoff: 5000,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }
}
