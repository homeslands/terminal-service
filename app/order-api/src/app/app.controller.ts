import { Controller, Get, HttpStatus, Ip } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from 'src/auth/decorator/public.decorator';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { TErrorCode } from './app.validation';
import { AppResponseDto } from './app.dto';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('hello')
  @Public()
  @ApiExcludeEndpoint()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('real-ip')
  @Public()
  realIp(@Ip() ip: string): string {
    return this.appService.realIp(ip);
  }

  @Get('error-codes')
  @Public()
  getErrorCodes(): AppResponseDto<TErrorCode> {
    const result = this.appService.getErrorCodes();
    return {
      message: 'Error codes have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<TErrorCode>;
  }
}
