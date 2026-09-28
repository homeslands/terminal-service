import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { SharedUserServiceClient } from './shared-user-service.client';

@Module({
  imports: [HttpModule],
  providers: [SharedUserServiceClient],
  exports: [SharedUserServiceClient],
})
export class SharedUserServiceModule {}
