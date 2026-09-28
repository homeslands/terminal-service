import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { signInternalRequest } from 'src/common/utils/internal-signature.util';

export interface PingResponse {
  from: string;
  message: string;
  receivedAt: string;
}

// Client wrapper goi HTTP noi bo sang shared-user (/internal/*). Cac module
// khac khong tu dung HttpService truc tiep - luon qua wrapper nay.
@Injectable()
export class SharedUserServiceClient {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  ping(message: string): Promise<PingResponse> {
    return this.post<PingResponse>('internal/test/ping', {
      from: 'terminal',
      message,
    });
  }

  // Moi path, ke ca /internal/*, deu mang tien to api/${version} - phai
  // khop chinh xac voi path that su ma InternalApiGuard cua shared-user nhan
  // duoc (request.originalUrl), neu khong chu ky HMAC se sai.
  private async post<T>(relativePath: string, body: unknown): Promise<T> {
    const baseUrl =
      this.configService.get<string>('SHARED_USER_API_URL') ||
      'http://localhost:8086';
    const version = this.configService.get<string>('VERSION') || 'v1.0.0';
    const path = `/api/${version}/${relativePath}`;
    const secret = this.configService.get<string>('INTERNAL_API_SECRET');
    const timestamp = Date.now().toString();
    const rawBody = JSON.stringify(body);
    const signature = signInternalRequest(
      secret,
      'POST',
      path,
      rawBody,
      timestamp,
    );

    const { data } = await firstValueFrom(
      this.httpService.post<T>(`${baseUrl}${path}`, body, {
        timeout: 5000,
        headers: {
          'X-Signature': signature,
          'X-Timestamp': timestamp,
        },
      }),
    );
    return data;
  }
}
