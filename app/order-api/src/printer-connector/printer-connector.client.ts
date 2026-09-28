import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { catchError, firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { PrinterConnectorException } from './printer-connector.exception';
import { PrinterConnectorValidation } from './printer-connector.validation';
import { PrinterConnectorService } from './printer-connector.service';
import {
  CreatePrintJobRequestDto,
  CreatePrintJobResponseDto,
} from './printer-connector.dto';

@Injectable()
export class PrinterConnectorClient {
  constructor(
    private readonly httpService: HttpService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    private readonly printerConnectorService: PrinterConnectorService,
  ) {}

  private async getConfig(branchSlug: string) {
    return this.printerConnectorService.findByBranch(branchSlug);
  }

  async createJob(
    branchSlug: string,
    requestData: CreatePrintJobRequestDto,
  ): Promise<CreatePrintJobResponseDto> {
    const context = `${PrinterConnectorClient.name}.${this.createJob.name}`;
    const config = await this.getConfig(branchSlug);
    const requestUrl = `${config.url}/api/v1/jobs`;

    this.logger.log(
      `Create print job ${requestData.external_id} to ${requestUrl}`,
      context,
    );

    const { data } = await firstValueFrom(
      this.httpService
        .post<CreatePrintJobResponseDto>(requestUrl, requestData, {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': config.apiKey,
          },
        })
        .pipe(
          catchError((error: AxiosError) => {
            this.logger.error(
              `Create print job failed: ${JSON.stringify(error.response?.data)}`,
              error.stack,
              context,
            );
            throw new PrinterConnectorException(
              PrinterConnectorValidation.CREATE_PRINT_JOB_ERROR,
              error.message,
            );
          }),
        ),
    );

    this.logger.log(
      `Print job created successfully: ${data.id} - status: ${data.status}`,
      context,
    );
    return data;
  }
}
