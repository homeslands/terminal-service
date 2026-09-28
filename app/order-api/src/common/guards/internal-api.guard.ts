import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { signInternalRequest } from 'src/common/utils/internal-signature.util';

const TIMESTAMP_TOLERANCE_MS = 30_000;

// Guard cho toan bo route /internal/* - xac thuc bang HMAC ky theo request
// (X-Signature + X-Timestamp), theo architect-http.md muc 5.1.
@Injectable()
export class InternalApiGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { rawBody?: Buffer }>();

    const signature = request.header('x-signature');
    const timestamp = request.header('x-timestamp');
    if (!signature || !timestamp) {
      throw new ForbiddenException('Missing internal signature headers');
    }

    const timestampMs = Number(timestamp);
    if (
      !Number.isFinite(timestampMs) ||
      Math.abs(Date.now() - timestampMs) > TIMESTAMP_TOLERANCE_MS
    ) {
      throw new ForbiddenException('Internal request timestamp expired');
    }

    const secret = this.configService.get<string>('INTERNAL_API_SECRET');
    const rawBody = request.rawBody ?? Buffer.from('');
    const expectedSignature = signInternalRequest(
      secret,
      request.method,
      request.originalUrl,
      rawBody.toString(),
      timestamp,
    );

    const provided = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      throw new ForbiddenException('Invalid internal signature');
    }

    return true;
  }
}
