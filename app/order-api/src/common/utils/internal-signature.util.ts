import { createHmac } from 'crypto';

// Dung chung boi InternalApiGuard (ben nhan) va cac client wrapper trong
// external-services/ (ben goi) de dam bao 2 phia tinh chu ky giong het nhau.
export function signInternalRequest(
  secret: string,
  method: string,
  path: string,
  rawBody: string,
  timestamp: string,
): string {
  return createHmac('sha256', secret)
    .update(`${method}\n${path}\n${rawBody}\n${timestamp}`)
    .digest('hex');
}
