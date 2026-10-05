import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { SharedUserServiceClient } from './shared-user-service.client';
import { UserActiveChecker } from './user-active.checker';

@Module({
  imports: [HttpModule],
  providers: [SharedUserServiceClient, UserActiveChecker],
  exports: [SharedUserServiceClient, UserActiveChecker],
})
export class SharedUserServiceModule {}
