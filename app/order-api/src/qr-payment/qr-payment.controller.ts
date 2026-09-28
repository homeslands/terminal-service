import {
  Controller,
  Post,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from 'src/user/user.decorator';
import { CurrentUserDto } from 'src/user/user.dto';
import { HasRoles } from 'src/role/roles.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { AppResponseDto } from 'src/app/app.dto';
import { QrPaymentService } from './qr-payment.service';
import { GenerateQrPaymentResponseDto } from './qr-payment.dto';

@ApiTags('QR Payment')
@ApiBearerAuth()
@Controller('payment/qr')
export class QrPaymentController {
  constructor(private readonly qrPaymentService: QrPaymentService) {}

  @Post('generate')
  @HasRoles(RoleEnum.Customer)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate QR code for point payment' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'QR code has been generated successfully',
    type: GenerateQrPaymentResponseDto,
  })
  async generate(
    @CurrentUser(new ValidationPipe({ validateCustomDecorators: true }))
    user: CurrentUserDto,
  ) {
    const result = await this.qrPaymentService.generate(user);
    return {
      message: 'QR code has been generated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<GenerateQrPaymentResponseDto>;
  }
}
