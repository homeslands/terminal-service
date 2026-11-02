import { HttpStatus } from '@nestjs/common';
import { AppException } from 'src/app/app.exception';
import { SharedUserServiceValidation } from './shared-user-service.validation';

// `shared-user` khong tra loi duoc (mat mang, timeout, 5xx, 403 sai chu ky)
// hoac khong thi hanh duoc lenh. HTTP van la 503 (sai lech D9 - client, hang
// doi thu lai 5xx van chay nhu cu); body mang ma nghiep vu 162001 thay cho
// `statusCode: 503` tran, de UI dich ra cau "he thong tam thoi khong phan hoi".
// Khong dung cho 404: "khong co nguoi nay" la USER_NOT_FOUND (muc 1.7).
export class SharedUserUnavailableException extends AppException {
  constructor(message?: string) {
    super(
      SharedUserServiceValidation.SHARED_USER_UNAVAILABLE,
      message,
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
