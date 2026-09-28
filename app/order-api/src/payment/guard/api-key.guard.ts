import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SystemConfigService } from 'src/system-config/system-config.service';
import { SystemConfigKey } from 'src/system-config/system-config.constant';
import { PaymentException } from '../payment.exception';
import { PaymentValidation } from '../payment.validation';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['authorization'];

    const validApiKey = await this.systemConfigService.get(
      SystemConfigKey.ACB_CALLBACK_API_KEY,
    );

    if (!validApiKey || apiKey !== validApiKey) {
      throw new PaymentException(PaymentValidation.CALLBACK_API_KEY_INVALID);
    }

    return true;
  }
}
