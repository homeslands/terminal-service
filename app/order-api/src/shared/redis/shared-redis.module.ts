import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueRegisterKey } from 'src/app/app.constants';
import { SharedRedisService } from './shared-redis.service';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: QueueRegisterKey.SHARED_REDIS })],
  providers: [SharedRedisService],
  exports: [SharedRedisService],
})
export class SharedRedisModule {}
