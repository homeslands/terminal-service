import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

// Consumer nhan message tu queue 'terminal_queue' (RabbitMQ). Tach rieng khoi
// TestController (REST cho client), giong nguyen tac tach internal/ rieng
// cho HTTP noi bo - moi giao thuc nen co class rieng, khong gop chung
// controller REST voi handler nhan message bat dong bo.
@Controller()
export class TestRmqController {
  private readonly logger = new Logger(TestRmqController.name);

  @MessagePattern('ping')
  handlePing(@Payload() data: unknown) {
    this.logger.log(`[RMQ] received ping: ${JSON.stringify(data)}`);
    const response = {
      message: 'pong from terminal',
      receivedAt: new Date().toISOString(),
      echo: data,
    };
    this.logger.log(`[RMQ] replying: ${JSON.stringify(response)}`);
    return response;
  }
}
