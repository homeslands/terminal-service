import { Controller, Get, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Public } from 'src/auth/decorator/public.decorator';
import { SharedUserServiceClient } from 'src/external-services/shared-user-service/shared-user-service.client';

// Route REST cho client - kich hoat goi qua shared-user (HTTP noi bo hoac
// publish RMQ). Phan nhan message RMQ tu shared-user nam o
// rmq/test-rmq.controller.ts, khong gop chung o day.

@Controller('test')
export class TestController {
  constructor(
    @Inject('SHARED_USER_RMQ') private readonly rmqClient: ClientProxy,
    private readonly sharedUserServiceClient: SharedUserServiceClient,
  ) {}

  // terminal goi HTTP noi bo sang shared-user (POST /internal/test/ping)
  @Public()
  @Get('http/shared-user')
  callSharedUserHttp() {
    return this.sharedUserServiceClient.ping('hello from terminal');
  }

  // terminal goi RMQ sang shared-user (pattern 'ping', gui vao
  // shared_user_queue)
  @Public()
  @Get('rmq/shared-user')
  callSharedUserRmq() {
    return this.rmqClient.send('ping', {
      from: 'terminal',
      at: new Date().toISOString(),
    });
  }
}
