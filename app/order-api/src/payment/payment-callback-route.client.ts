import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { catchError, firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  ACBResponseDto,
  ACBStatusRequestDto,
} from 'src/acb-connector/acb-connector.dto';
import { PaymentCallbackRoute } from './entity/payment-callback-route.entity';
import { PaymentException } from './payment.exception';
import { PaymentValidation } from './payment.validation';

@Injectable()
export class PaymentCallbackRouteClient {
  constructor(
    private readonly httpService: HttpService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
  ) {}

  /**
   * Forward the whole ACB callback request to an external service and relay its response back to ACB
   * @param {PaymentCallbackRoute} route
   * @param {ACBStatusRequestDto} requestData
   * @returns {Promise<ACBResponseDto>}
   */
  async forward(
    route: PaymentCallbackRoute,
    requestData: ACBStatusRequestDto,
  ): Promise<ACBResponseDto> {
    const context = `${PaymentCallbackRouteClient.name}.${this.forward.name}`;
    const { data } = await firstValueFrom(
      this.httpService
        .post<ACBResponseDto>(route.targetUrl, requestData, {
          headers: {
            'Content-Type': 'application/json',
            ...(route.targetApiKey && { authorization: route.targetApiKey }),
          },
          timeout: route.timeoutMs,
        })
        .pipe(
          catchError((error: AxiosError) => {
            this.logger.error(
              `Forward callback to ${route.targetUrl} failed: ${error.message}`,
              error.stack,
              context,
            );
            throw new PaymentException(
              PaymentValidation.PAYMENT_CALLBACK_FORWARD_FAILED,
              error.message,
            );
          }),
        ),
    );
    return data;
  }
}
