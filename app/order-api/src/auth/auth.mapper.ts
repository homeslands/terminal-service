import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';

import { AuthProfileResponseDto } from './auth.dto';
import { User } from 'src/user/user.entity';

/**
 * Buoc 3.3 (giai doan 3) - profile nay con DUNG MOT map:
 * `User -> AuthProfileResponseDto`, phuc vu `GET /auth/profile`.
 *
 * Nam map kia da xoa cung bon entity token (`VerifyEmailToken`,
 * `ForgotPasswordToken`, `RegisterOtpToken`) va cac DTO dang ky cua buoc nay.
 * `extend(baseMapper(mapper))` theo do cung khong con can, nen `extend` va
 * `baseMapper` roi khoi danh sach import.
 *
 * Luu y khi doc lai: map cua entity token KHONG can
 * `TypeOrmModule.forFeature` (buoc 3.2 da go chung khoi do) - mapper chi can
 * CLASS. Vi vay o 3.2 tep nay van bien dich binh thuong du forFeature da sach;
 * den 3.3 moi den luot no.
 */
@Injectable()
export class AuthProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(mapper, User, AuthProfileResponseDto);
    };
  }
}
