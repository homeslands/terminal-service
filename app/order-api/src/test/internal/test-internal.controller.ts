import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Public } from 'src/auth/decorator/public.decorator';
import { InternalApiGuard } from 'src/common/guards/internal-api.guard';

interface PingRequest {
  from: string;
  message: string;
}

// Expose POST /internal/test/ping - nhan goi HTTP noi bo tu shared-user.
@UseGuards(InternalApiGuard)
@Controller('internal/test')
export class TestInternalController {
  @Public()
  @Post('ping')
  ping(@Body() body: PingRequest) {
    return {
      from: 'terminal',
      message: `pong from terminal (received: ${body.message})`,
      receivedAt: new Date().toISOString(),
    };
  }
}
