import { Module } from '@nestjs/common';
import { TestController } from './test.controller';
import { TestInternalController } from './internal/test-internal.controller';
import { TestRmqController } from './rmq/test-rmq.controller';
import { SharedClientsModule } from 'src/shared/clients/shared-clients.module';
import { SharedUserServiceModule } from 'src/external-services/shared-user-service/shared-user-service.module';

@Module({
  imports: [SharedClientsModule, SharedUserServiceModule],
  controllers: [TestController, TestInternalController, TestRmqController],
})
export class TestModule {}
