import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserModule } from 'src/user/user.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from './constants';
import { JwtStrategy } from './passport/jwt/jwt.strategy';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/user/user.entity';
import { ConfigModule } from '@nestjs/config';
import { AuthProfile } from './auth.mapper';
import { Branch } from 'src/branch/branch.entity';
import { FileModule } from 'src/file/file.module';
import { MailModule } from 'src/mail/mail.module';
import { Role } from 'src/role/role.entity';
import { SystemConfigModule } from 'src/system-config/system-config.module';
import { VerifyEmailToken } from './entity/verify-email-token.entity';
import { DbModule } from 'src/db/db.module';
import { AuthUtils } from './auth.utils';
import { ZaloOaConnectorConfig } from 'src/zalo-oa-connector/entity/zalo-oa-connector.entity';
import { VerifyPhoneNumberToken } from './entity/verify-phone-number-token.entity';
import { RegisterOtpToken } from './entity/register-otp-token.entity';
import { ZaloOaConnectorModule } from 'src/zalo-oa-connector/zalo-oa-connector.module';
import { SharedModule } from 'src/shared/shared.module';
import { SharedUserServiceModule } from 'src/external-services/shared-user-service/shared-user-service.module';
import { UserProvisioningModule } from 'src/user/user-provisioning.module';

@Module({
  imports: [
    UserModule,
    PassportModule,
    // ⛔ KHONG co khoa KY o day. `terminal` chi giu public key cua
    // `shared-user`: verify duoc, ky KHONG duoc.
    //
    // Day moi la hang rao that, khong phai `auth/constants.ts`. Doi
    // `constants.ts` sang RS256 ma de `JwtModule.register({ secret })` con
    // nguyen thi `terminal` VAN KY DUOC JWT - va token do bi `shared-user` tu
    // choi, ra dung loai loi "dang nhap duoc ma goi gi cung 401".
    JwtModule.register({
      publicKey: jwtConstants.publicKey,
      verifyOptions: { algorithms: [jwtConstants.algorithm] },
    }),
    TypeOrmModule.forFeature([
      User,
      Branch,
      Role,
      VerifyEmailToken,
      ZaloOaConnectorConfig,
      VerifyPhoneNumberToken,
      RegisterOtpToken,
    ]),
    ConfigModule,
    FileModule,
    MailModule,
    SystemConfigModule,
    DbModule,
    UserModule,
    ZaloOaConnectorModule,
    SharedModule,
    SharedUserServiceModule,
    // QD19 lop 0 - JwtStrategy tu cap hang cuc bo bang CHUNG mot
    // `ensureLocalUser` voi ba lop con lai.
    UserProvisioningModule,
  ],
  controllers: [AuthController],
  // LocalStrategy da bi go cung voi POST /auth/login: no goi
  // AuthService.validateUser (so mat khau cuc bo), ma mat khau khong con thuoc
  // ve terminal. Dang nhap di thang sang shared-user.
  providers: [AuthService, JwtStrategy, AuthProfile, AuthUtils],
})
export class AuthModule { }
