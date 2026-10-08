import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AuthProfileResponseDto,
  InitiateVerifyEmailRequestDto,
  ConfirmEmailVerificationCodeRequestDto,
  VerifyEmailResponseDto,
  VerifyPhoneNumberResponseDto,
  ConfirmPhoneNumberVerificationCodeRequestDto,
} from './auth.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/user/user.entity';
import { IsNull, MoreThan, Not, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AuthException } from './auth.exception';
import { AuthValidation } from './auth.validation';
import moment from 'moment';
import { Branch } from 'src/branch/branch.entity';
import { FileService } from 'src/file/file.service';
import { MailService } from 'src/mail/mail.service';
import { CurrentUserDto } from 'src/user/user.dto';
import { Role } from 'src/role/role.entity';
import { SystemConfigService } from 'src/system-config/system-config.service';
import { SystemConfigKey } from 'src/system-config/system-config.constant';
import { VerifyEmailToken } from './entity/verify-email-token.entity';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { AuthUtils } from './auth.utils';
import { UserUtils } from 'src/user/user.utils';
import { getRandomString } from 'src/helper';
import { VerifyPhoneNumberToken } from './entity/verify-phone-number-token.entity';
import { RegisterOtpToken } from './entity/register-otp-token.entity';
import { ZaloOaConnectorClient } from 'src/zalo-oa-connector/zalo-oa-connector.client';
import {
  SmsDataRequestDto,
  ZaloDataRequestDto,
  ZaloOaInitiateSmsByMultiChannelMessageRequestDto,
  ZaloOaInitiateSmsResponseDto,
} from 'src/zalo-oa-connector/zalo-oa-connector.dto';
import {
  fillVerifyAccountContent,
  SMSChannel,
  ZaloOaStrategy,
} from 'src/zalo-oa-connector/zalo-oa-connector.constants';
import { ZaloOaConnectorConfig } from 'src/zalo-oa-connector/entity/zalo-oa-connector.entity';
import { ZaloOaConnectorException } from 'src/zalo-oa-connector/zalo-oa-connector.exception';
import { ZaloOaConnectorValidation } from 'src/zalo-oa-connector/zalo-oa-connector.validation';
import { ZaloOaConnectorHistory } from 'src/zalo-oa-connector/entity/zalo-oa-connector-history.entity';
import { SharedBalanceService } from 'src/shared/services/shared-balance.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SharedUserServiceClient } from 'src/external-services/shared-user-service/shared-user-service.client';

@Injectable()
export class AuthService {
  private duration: number;
  private refeshableDuration: number;
  private zaloOaApiKey: string;
  private zaloOaSecretKey: string;
  private zaloOaId: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectMapper()
    private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    @InjectRepository(VerifyEmailToken)
    private readonly verifyEmailRepository: Repository<VerifyEmailToken>,
    @InjectRepository(VerifyPhoneNumberToken)
    private readonly verifyPhoneNumberRepository: Repository<VerifyPhoneNumberToken>,
    @InjectRepository(RegisterOtpToken)
    private readonly registerOtpTokenRepository: Repository<RegisterOtpToken>,
    private readonly fileService: FileService,
    private readonly mailService: MailService,
    private readonly systemConfigService: SystemConfigService,
    private readonly transactionManagerService: TransactionManagerService,
    private readonly authUtils: AuthUtils,
    private readonly userUtils: UserUtils,
    private readonly zaloOaConnectorClient: ZaloOaConnectorClient,
    @InjectRepository(ZaloOaConnectorConfig)
    private readonly zaloOaConnectorConfigRepository: Repository<ZaloOaConnectorConfig>,
    private readonly sharedBalanceService: SharedBalanceService,
    private readonly eventEmitter: EventEmitter2,
    private readonly sharedUserServiceClient: SharedUserServiceClient,
  ) {
    this.duration = this.configService.get<number>('DURATION');
    this.refeshableDuration = this.configService.get<number>(
      'REFRESHABLE_DURATION',
    );
    this.zaloOaApiKey = this.configService.get<string>('ZALO_OA_API_KEY');
    this.zaloOaSecretKey = this.configService.get<string>('ZALO_OA_SECRET_KEY');
    this.zaloOaId = this.configService.get<string>('ZALO_OA_ID');
  }

  private isTodayBirthday(dobDM: string): boolean {
    const today = new Date();
    const todayDM = `${String(today.getDate()).padStart(2, '0')}${String(today.getMonth() + 1).padStart(2, '0')}`;
    return dobDM === todayDM;
  }

  async getZaloOaConnectorConfig(
    strategy: string,
  ): Promise<ZaloOaConnectorConfig> {
    const context = `${AuthService.name}.${this.getZaloOaConnectorConfig.name}`;
    const zaloOaConnectorConfig =
      await this.zaloOaConnectorConfigRepository.findOne({
        where: {
          strategy,
        },
      });
    if (!zaloOaConnectorConfig) {
      this.logger.error(
        `Zalo OA connector config not found for strategy ${ZaloOaStrategy.VERIFY_ACCOUNT}`,
        null,
        context,
      );
      throw new ZaloOaConnectorException(
        ZaloOaConnectorValidation.ZALO_OA_CONNECTOR_CONFIG_NOT_FOUND,
      );
    }
    return zaloOaConnectorConfig;
  }

  /**
   *  Retrieves the frontend URL configuration.
   *
   * This method fetches the frontend URL from the system configuration
   * service using the predefined `SystemConfigKey.FRONTEND_URL` key.
   * @returns {Promise<string>} The frontend URL as a string
   */
  async getFrontendUrl(): Promise<string> {
    const context = `${AuthService.name}.${this.getFrontendUrl.name}`;
    this.logger.log(`Get frontend url`, context);
    const url = await this.systemConfigService.get(
      SystemConfigKey.FRONTEND_URL,
    );
    if (!url) {
      this.logger.error(`Frontend URL not found`, context);
    }

    return url;
  }


  async initiateVerifyEmail(
    currentUserDto: CurrentUserDto,
    requestData: InitiateVerifyEmailRequestDto,
  ): Promise<VerifyEmailResponseDto> {
    const context = `${AuthService.name}.${this.initiateVerifyEmail.name}`;
    this.logger.log(
      `Request initiate verify email ${JSON.stringify(requestData)}`,
      context,
    );
    const user = await this.userUtils.getUser({
      where: {
        id: currentUserDto.userId ?? IsNull(),
        phonenumber: Not('default-customer'),
      },
    });

    if (user.isVerifiedEmail) {
      this.logger.warn(`User ${user.id} already verified email`, context);
      throw new AuthException(AuthValidation.USER_ALREADY_VERIFIED_EMAIL);
    }

    const existingToken = await this.verifyEmailRepository.findOne({
      where: {
        user: {
          id: user.id,
        },
        expiresAt: MoreThan(new Date()),
      },
    });
    if (existingToken) {
      this.logger.warn(
        `User ${user.id} already has a valid email token`,
        context,
      );
      throw new AuthException(AuthValidation.VERIFY_EMAIL_TOKEN_ALREADY_EXISTS);
    }

    // Check email in system except current user
    const existedEmailInSystem = await this.userRepository.findOne({
      where: {
        email: requestData.email,
        id: Not(user.id),
      },
    });
    if (existedEmailInSystem) {
      this.logger.warn(AuthValidation.EMAIL_ALREADY_EXISTS.message, context);
      throw new AuthException(AuthValidation.EMAIL_ALREADY_EXISTS);
    }

    const existedEmailCurrentUser = await this.userRepository.findOne({
      where: {
        email: requestData.email,
        id: user.id,
      },
    });
    if (existedEmailCurrentUser) {
      if (user.isVerifiedEmail) {
        this.logger.warn(
          AuthValidation.THIS_EMAIL_ALREADY_VERIFY.message,
          context,
        );
        throw new AuthException(AuthValidation.THIS_EMAIL_ALREADY_VERIFY);
      }
    }

    const token = getRandomString().slice(0, 6).toUpperCase();
    const verifyEmailToken = new VerifyEmailToken();
    Object.assign(verifyEmailToken, {
      expiresAt: moment()
        .add(60 * 10, 'seconds')
        .toDate(),
      token,
      user,
      email: requestData.email,
    } as VerifyEmailToken);

    const result =
      await this.transactionManagerService.execute<VerifyEmailToken>(
        async (manager) => {
          const createdToken = await manager.save(verifyEmailToken);
          await this.mailService.sendVerifyEmail(
            user,
            token,
            requestData.email,
            moment(createdToken.expiresAt).format('DD/MM/YYYY HH:mm'),
          );
          return createdToken;
        },
        () => {
          this.logger.log(
            `User ${user.id} created initiate verify email token`,
            context,
          );
        },
        (error) => {
          this.logger.error(
            `Error when create initiate verify email token`,
            error.stack,
            context,
          );
          throw new AuthException(
            AuthValidation.ERROR_CREATE_VERIFY_EMAIL_TOKEN,
          );
        },
      );

    return this.mapper.map(result, VerifyEmailToken, VerifyEmailResponseDto);
  }

  async resendVerifyEmailCode(
    currentUserDto: CurrentUserDto,
  ): Promise<VerifyEmailResponseDto> {
    const context = `${AuthService.name}.${this.resendVerifyEmailCode.name}`;
    this.logger.log(
      `Request resend verify email code ${JSON.stringify(currentUserDto)}`,
      context,
    );
    const user = await this.userUtils.getUser({
      where: {
        id: currentUserDto.userId ?? IsNull(),
        phonenumber: Not('default-customer'),
      },
    });

    if (user.isVerifiedEmail) {
      this.logger.warn(`User ${user.id} already verified email`, context);
      throw new AuthException(AuthValidation.USER_ALREADY_VERIFIED_EMAIL);
    }

    const existingToken: VerifyEmailToken =
      await this.verifyEmailRepository.findOne({
        where: {
          user: {
            id: user.id,
          },
          expiresAt: MoreThan(new Date()),
        },
      });
    if (!existingToken) {
      this.logger.warn(`Verify email token is not existed`, context);
      throw new AuthException(AuthValidation.VERIFY_EMAIL_TOKEN_NOT_FOUND);
    }

    await this.mailService.sendVerifyEmail(
      user,
      existingToken.token,
      existingToken.email,
      moment(existingToken.expiresAt).format('DD/MM/YYYY HH:mm'),
    );

    return this.mapper.map(
      existingToken,
      VerifyEmailToken,
      VerifyEmailResponseDto,
    );
  }

  async confirmEmailVerificationCode(
    currentUserDto: CurrentUserDto,
    requestData: ConfirmEmailVerificationCodeRequestDto,
  ): Promise<boolean> {
    const context = `${AuthService.name}.${this.confirmEmailVerificationCode.name}`;

    const user = await this.userUtils.getUser({
      where: {
        id: currentUserDto.userId ?? IsNull(),
        phonenumber: Not('default-customer'),
      },
    });

    if (user.isVerifiedEmail) {
      this.logger.warn(`User ${user.id} already verified email`, context);
      throw new AuthException(AuthValidation.USER_ALREADY_VERIFIED_EMAIL);
    }

    const existToken = await this.verifyEmailRepository.findOne({
      where: {
        token: requestData.code,
        // expiresAt: MoreThan(new Date()),
        user: { id: user.id },
      },
    });
    if (!existToken) {
      this.logger.warn(`Verify token is not existed`, context);
      throw new AuthException(AuthValidation.VERIFY_EMAIL_TOKEN_NOT_FOUND);
    }

    if (new Date().getTime() > existToken.expiresAt.getTime()) {
      this.logger.warn(
        AuthValidation.VERIFY_EMAIL_TOKEN_IS_EXPIRED.message,
        context,
      );
      throw new AuthException(AuthValidation.VERIFY_EMAIL_TOKEN_IS_EXPIRED);
    }

    user.email = existToken.email;
    user.isVerifiedEmail = true;

    // Set token expired after forgot password successfully
    existToken.expiresAt = new Date(Date.now() - 120000); // Set expiry time to the past

    await this.transactionManagerService.execute(
      async (manager) => {
        await manager.save(user);
        await manager.save(existToken);
      },
      () => {
        this.logger.log(
          `User ${user.id} confirmed email verification token`,
          context,
        );
      },
      (error) => {
        this.logger.error(
          `Error when confirm email verification`,
          error.stack,
          context,
        );
        throw new AuthException(
          AuthValidation.CONFIRM_EMAIL_VERIFICATION_ERROR,
        );
      },
    );

    return true;
  }

  /**
   *  Retrieves the frontend URL configuration.
   *
   * This method fetches the frontend URL from the system configuration
   * service using the predefined `SystemConfigKey.FRONTEND_URL` key.
   * @returns {Promise<string>} The frontend URL as a string
   */
  async getBackendUrl(): Promise<string> {
    const context = `${AuthService.name}.${this.getBackendUrl.name}`;
    this.logger.log(`Get backend url`, context);
    const url = await this.systemConfigService.get(SystemConfigKey.BACKEND_URL);
    if (!url) {
      this.logger.error(`Backend URL not found`, context);
    }

    return url;
  }

  async initiateVerifyPhoneNumber(
    currentUserDto: CurrentUserDto,
  ): Promise<VerifyPhoneNumberResponseDto> {
    const context = `${AuthService.name}.${this.initiateVerifyPhoneNumber.name}`;
    this.logger.log(`Request initiate verify phone number`, context);
    const user = await this.userUtils.getUser({
      where: {
        id: currentUserDto.userId ?? IsNull(),
        phonenumber: Not('default-customer'),
      },
    });

    if (user.isVerifiedPhonenumber) {
      this.logger.warn(
        `User ${user.id} already verified phone number`,
        context,
      );
      throw new AuthException(AuthValidation.USER_ALREADY_VERIFIED_PHONENUMBER);
    }

    this.logger.log(`User ${user.slug} initiate verify phone number`, context);

    const existingToken = await this.verifyPhoneNumberRepository.findOne({
      where: {
        user: {
          id: user.id,
        },
        expiresAt: MoreThan(new Date()),
      },
    });
    if (existingToken) {
      this.logger.warn(
        `User ${user.id} already has a valid phone number token`,
        context,
      );
      throw new AuthException(
        AuthValidation.VERIFY_PHONE_NUMBER_TOKEN_ALREADY_EXISTS,
      );
    }

    const token = getRandomString().slice(0, 6).toUpperCase();
    const verifyPhoneNumberToken = new VerifyPhoneNumberToken();
    Object.assign(verifyPhoneNumberToken, {
      expiresAt: moment()
        .add(60 * 10, 'seconds')
        .toDate(),
      token,
      user,
    } as VerifyPhoneNumberToken);

    const result =
      await this.transactionManagerService.execute<VerifyPhoneNumberToken>(
        async (manager) => {
          const zaloOaConnectorConfig = await this.getZaloOaConnectorConfig(
            ZaloOaStrategy.VERIFY_ACCOUNT,
          );

          const backendUrl = await this.getBackendUrl();
          const expiresTime = moment(verifyPhoneNumberToken.expiresAt).format(
            'HH:mm DD/MM/YYYY',
          );
          const requestIdZns = getRandomString();
          const requestIdSms = getRandomString();

          const zaloOaInitiateSmsByMultiChannelMessageRequestDto =
            new ZaloOaInitiateSmsByMultiChannelMessageRequestDto();
          zaloOaInitiateSmsByMultiChannelMessageRequestDto.ApiKey =
            this.zaloOaApiKey;
          zaloOaInitiateSmsByMultiChannelMessageRequestDto.SecretKey =
            this.zaloOaSecretKey;
          zaloOaInitiateSmsByMultiChannelMessageRequestDto.Phone =
            user.phonenumber;
          zaloOaInitiateSmsByMultiChannelMessageRequestDto.Channels = [
            SMSChannel.ZALO,
            SMSChannel.SMS,
          ];

          zaloOaInitiateSmsByMultiChannelMessageRequestDto.Data = [
            {
              TempID: zaloOaConnectorConfig.templateId,
              Params: [token, expiresTime],
              OAID: this.zaloOaId,
              campaignid: zaloOaConnectorConfig.strategy,
              CallbackUrl: `${backendUrl}/zalo-oa-connector/callback/status`,
              RequestId: requestIdZns,
              Sandbox: '0',
              SendingMode: '1',
            } as ZaloDataRequestDto,
            {
              Content: fillVerifyAccountContent(token, expiresTime),
              IsUnicode: '0',
              SmsType: '2',
              Brandname: 'TrendCoffee',
              CallbackUrl: `${backendUrl}/zalo-oa-connector/callback/status`,
              RequestId: requestIdSms,
              Sandbox: '0',
            } as SmsDataRequestDto,
          ];

          const zaloOaInitiateResponse: ZaloOaInitiateSmsResponseDto =
            await this.zaloOaConnectorClient.initiateVerifyPhoneNumberSmsByMultiChannelMessage(
              zaloOaInitiateSmsByMultiChannelMessageRequestDto,
            );

          if (zaloOaInitiateResponse.ErrorMessage) {
            this.logger.error(
              `Error when initiate sms verify account: ${zaloOaInitiateResponse.ErrorMessage}`,
              context,
            );
            throw new ZaloOaConnectorException(
              ZaloOaConnectorValidation.ERROR_INITIATE_SMS_VERIFY_ACCOUNT,
            );
          }
          const createdToken = await manager.save(verifyPhoneNumberToken);
          if (zaloOaInitiateResponse.SMSID) {
            const zaloOaConnectorHistory = new ZaloOaConnectorHistory();
            Object.assign(zaloOaConnectorHistory, {
              tokenId: createdToken.id,
              smsId: zaloOaInitiateResponse.SMSID,
              requestId: `${requestIdZns}-${requestIdSms}`,
              templateId: zaloOaConnectorConfig.templateId,
              strategy: zaloOaConnectorConfig.strategy,
            } as ZaloOaConnectorHistory);

            await manager.save(zaloOaConnectorHistory);
          }
          return createdToken;
        },
        () => {
          this.logger.log(
            `User ${user.id} created initiate verify phone number token`,
            context,
          );
        },
        (error) => {
          this.logger.error(
            `Error when create initiate verify phone number token`,
            error.stack,
            context,
          );
          throw new AuthException(
            AuthValidation.ERROR_CREATE_VERIFY_PHONE_NUMBER_TOKEN,
          );
        },
      );

    return this.mapper.map(
      result,
      VerifyPhoneNumberToken,
      VerifyPhoneNumberResponseDto,
    );
  }

  async resendVerifyPhoneNumberCode(
    currentUserDto: CurrentUserDto,
  ): Promise<VerifyPhoneNumberResponseDto> {
    const context = `${AuthService.name}.${this.resendVerifyPhoneNumberCode.name}`;
    this.logger.log(`Request resend verify phone number code}`, context);
    const user = await this.userUtils.getUser({
      where: {
        id: currentUserDto.userId ?? IsNull(),
        phonenumber: Not('default-customer'),
      },
    });

    if (user.isVerifiedPhonenumber) {
      this.logger.warn(
        `User ${user.id} already verified phone number`,
        context,
      );
      throw new AuthException(AuthValidation.USER_ALREADY_VERIFIED_PHONENUMBER);
    }

    const existingToken: VerifyPhoneNumberToken =
      await this.verifyPhoneNumberRepository.findOne({
        where: {
          user: {
            id: user.id,
          },
          expiresAt: MoreThan(new Date()),
        },
      });
    if (!existingToken) {
      this.logger.warn(`Verify phone number token is not existed`, context);
      throw new AuthException(
        AuthValidation.VERIFY_PHONE_NUMBER_TOKEN_NOT_FOUND,
      );
    }

    const result =
      await this.transactionManagerService.execute<VerifyPhoneNumberToken>(
        async (manager) => {
          const zaloOaConnectorConfig = await this.getZaloOaConnectorConfig(
            ZaloOaStrategy.VERIFY_ACCOUNT,
          );
          const backendUrl = await this.getBackendUrl();
          const expiresTime = moment(existingToken.expiresAt).format(
            'HH:mm DD/MM/YYYY',
          );
          const requestId = getRandomString();

          const zaloOaInitiateSmsByMultiChannelMessageRequestDto =
            new ZaloOaInitiateSmsByMultiChannelMessageRequestDto();
          zaloOaInitiateSmsByMultiChannelMessageRequestDto.ApiKey =
            this.zaloOaApiKey;
          zaloOaInitiateSmsByMultiChannelMessageRequestDto.SecretKey =
            this.zaloOaSecretKey;
          zaloOaInitiateSmsByMultiChannelMessageRequestDto.Phone =
            user.phonenumber;
          zaloOaInitiateSmsByMultiChannelMessageRequestDto.Channels = [
            SMSChannel.ZALO,
            SMSChannel.SMS,
          ];

          zaloOaInitiateSmsByMultiChannelMessageRequestDto.Data = [
            {
              TempID: zaloOaConnectorConfig.templateId,
              Params: [existingToken.token, expiresTime],
              OAID: this.zaloOaId,
              campaignid: zaloOaConnectorConfig.strategy,
              CallbackUrl: `${backendUrl}/zalo-oa-connector/callback/status`,
              RequestId: getRandomString(),
              Sandbox: '0',
              SendingMode: '1',
            } as ZaloDataRequestDto,
            {
              Content: fillVerifyAccountContent(
                existingToken.token,
                expiresTime,
              ),
              IsUnicode: '0',
              SmsType: '2',
              Brandname: 'TrendCoffee',
              CallbackUrl: `${backendUrl}/zalo-oa-connector/callback/status`,
              RequestId: getRandomString(),
              Sandbox: '0',
            } as SmsDataRequestDto,
          ];

          const zaloOaInitiateResponse: ZaloOaInitiateSmsResponseDto =
            await this.zaloOaConnectorClient.initiateVerifyPhoneNumberSmsByMultiChannelMessage(
              zaloOaInitiateSmsByMultiChannelMessageRequestDto,
            );
          if (zaloOaInitiateResponse.ErrorMessage) {
            this.logger.error(
              `Error when initiate sms verify account: ${zaloOaInitiateResponse.ErrorMessage}`,
              context,
            );
            throw new ZaloOaConnectorException(
              ZaloOaConnectorValidation.ERROR_INITIATE_SMS_VERIFY_ACCOUNT,
            );
          }
          if (zaloOaInitiateResponse.SMSID) {
            const zaloOaConnectorHistory = new ZaloOaConnectorHistory();
            Object.assign(zaloOaConnectorHistory, {
              tokenId: existingToken.id,
              smsId: zaloOaInitiateResponse.SMSID,
              requestId: requestId,
              templateId: zaloOaConnectorConfig.templateId,
              strategy: zaloOaConnectorConfig.strategy,
            } as ZaloOaConnectorHistory);
            await manager.save(zaloOaConnectorHistory);
          }
          const updatedToken = await manager.save(existingToken);
          return updatedToken;
        },
        () => {
          this.logger.log(
            `User ${user.id} resend verify phone number code`,
            context,
          );
        },
        (error) => {
          this.logger.error(
            `Error when resend verify phone number code`,
            error.stack,
            context,
          );
          throw new AuthException(
            AuthValidation.ERROR_CREATE_VERIFY_PHONE_NUMBER_TOKEN,
          );
        },
      );

    return this.mapper.map(
      result,
      VerifyPhoneNumberToken,
      VerifyPhoneNumberResponseDto,
    );
  }

  async confirmPhoneNumberVerificationCode(
    currentUserDto: CurrentUserDto,
    requestData: ConfirmPhoneNumberVerificationCodeRequestDto,
  ): Promise<boolean> {
    const context = `${AuthService.name}.${this.confirmPhoneNumberVerificationCode.name}`;

    const user = await this.userUtils.getUser({
      where: {
        id: currentUserDto.userId ?? IsNull(),
        phonenumber: Not('default-customer'),
      },
    });

    if (user.isVerifiedPhonenumber) {
      this.logger.warn(
        `User ${user.id} already verified phone number`,
        context,
      );
      throw new AuthException(AuthValidation.USER_ALREADY_VERIFIED_PHONENUMBER);
    }

    const existToken = await this.verifyPhoneNumberRepository.findOne({
      where: {
        token: requestData.code,
        // expiresAt: MoreThan(new Date()),
        user: { id: user.id },
      },
    });
    if (!existToken) {
      this.logger.warn(`Verify phone number token is not existed`, context);
      throw new AuthException(
        AuthValidation.VERIFY_PHONE_NUMBER_TOKEN_NOT_FOUND,
      );
    }

    if (new Date().getTime() > existToken.expiresAt.getTime()) {
      this.logger.warn(
        AuthValidation.VERIFY_PHONE_NUMBER_TOKEN_IS_EXPIRED.message,
        context,
      );
      throw new AuthException(
        AuthValidation.VERIFY_PHONE_NUMBER_TOKEN_IS_EXPIRED,
      );
    }

    user.isVerifiedPhonenumber = true;

    // Set token expired after forgot password successfully
    existToken.expiresAt = new Date(Date.now() - 120000); // Set expiry time to the past

    await this.transactionManagerService.execute(
      async (manager) => {
        await manager.save(user);
        await manager.save(existToken);
      },
      () => {
        this.logger.log(
          `User ${user.id} confirmed phone number verification token`,
          context,
        );
      },
      (error) => {
        this.logger.error(
          `Error when confirm phone number verification`,
          error.stack,
          context,
        );
        throw new AuthException(
          AuthValidation.CONFIRM_PHONE_NUMBER_VERIFICATION_ERROR,
        );
      },
    );

    return true;
  }

  /**
   * Handle retrieve user profile
   *
   * Ghep HAI NGUON (architect-http.md muc 1.1 quy tac 4):
   * - identity (ho ten, SDT, email, dob, address, avatar, co xac minh) tu
   *   `shared-user` - hoi lai tren moi lan goi, khong doc cache cuc bo co the
   *   cu (nguoi dung co the tu sua qua `PATCH {shared-user}/auth/profile`, bo
   *   qua `terminal` hoan toan);
   * - role + branch tu `terminal` - day moi la nguon that cua hai field do.
   *
   * Day la ly do UI giu `getProfile()` goi `terminal` chu khong goi
   * `shared-user`: mot hanh dong, mot lenh goi, UI khong ghep ho.
   *
   * ## ⚠️ VAN LOAD `role.permissions` - KHAC `trend`, va day la CO Y
   *
   * `trend` da bo field nay khoi response profile ("mot join DB thua, khong noi
   * nao doc"). O `terminal` cau do KHONG DUNG: co **ba** noi tieu thu doc
   * `userInfo.role.permissions.map(p => p.authority.code)`:
   *
   *   app/system/chef-area/page.tsx
   *   app/system/order-management/DataTable/columns/order-history-columns.tsx
   *   components/app/tabscontent/system-chef-area-management.tabscontent.tsx
   *
   * Ba cho do can ma cua TUNG AUTHORITY (`VIEW_KITCHEN_AREA`,
   * `DELETE_KITCHEN_AREA`, `EDIT_KITCHEN_AREA`, `DELETE_ORDER`), con
   * `GET /auth/scope` chi tra ma cua AUTHORITY GROUP (`AuthUtils.buildScope`
   * gom `permission.authority.authorityGroup.code`). **Hai do hat khac nhau,
   * khong thay the duoc nhau.**
   *
   * Bo field nay o giai doan 1 se lam ba be mat do nhan `undefined` va **im
   * lang** mat quyen (khong loi, khong log): nut xoa don bien mat, khu vuc bep
   * khong xem/sua/xoa duoc. Vi the viec bo no doi sang giai doan sau, cung dot
   * voi viec dua ma authority-level vao `/auth/scope` hoac doi ba cho tren sang
   * `GET /authority-group` + scope.
   *
   * Type `IUserInfo.role.permissions` ben UI da doi thanh **optional** de ba cho
   * do buoc phai null-safe ngay tu bay gio - ngay field nay that su bi bo thi
   * khong cho nao no.
   *
   * Fail-OPEN o day (khac `getUserBySlug` cua UserService, fail-closed): day
   * la enrichment hien thi cho CHINH nguoi dang dang nhap, khong phai kiem
   * tra bao mat. Va nguoi nay vua di qua `JwtStrategy` - thu da goi
   * shared-user va nem 503 neu no khong tra loi - nen den duoc day thi
   * shared-user dang song; nhanh catch chi bat duoc truong hop rieng lenh goi
   * nay hong, va khi do tra ban cache con tot hon lam hong ca man hinh.
   *
   * @param {string} userId
   * @returns {Promise<AuthProfileResponseDto>} User profile
   * @throws {AuthException} Throw if user not found
   */
  async getProfile({
    userId,
  }: {
    userId: string;
  }): Promise<AuthProfileResponseDto> {
    const context = `${AuthService.name}.${this.getProfile.name}`;
    const user = await this.userUtils.getUser({
      where: { id: userId },
      relations: {
        branch: {
          addressDetail: true,
        },
        role: {
          permissions: {
            authority: {
              authorityGroup: true,
            },
          },
        },
        userRequirements: true,
      },
    });
    const dto = this.mapper.map(user, User, AuthProfileResponseDto);
    try {
      const identity = await this.sharedUserServiceClient.lookupById(
        user.sharedUserId,
      );
      if (identity) {
        Object.assign(dto, {
          phonenumber: identity.phonenumber ?? dto.phonenumber,
          firstName: identity.firstName ?? dto.firstName,
          lastName: identity.lastName ?? dto.lastName,
          dob: identity.dob ?? dto.dob,
          email: identity.email ?? dto.email,
          address: identity.address ?? dto.address,
          image: identity.image ?? dto.image,
          // Ngon ngu cung la identity (architect-http.md muc 1.6): doi o
          // service nay thi service kia phai thay - doc cot cuc bo la tra
          // ban cu cua rieng service do.
          language: identity.language ?? dto.language,
          isVerifiedEmail: identity.isVerifiedEmail ?? dto.isVerifiedEmail,
          isVerifiedPhonenumber:
            identity.isVerifiedPhonenumber ?? dto.isVerifiedPhonenumber,
        });
      }
    } catch (error) {
      this.logger.warn(
        `Failed to enrich profile identity from shared-user, falling back to local cache: ${error?.message}`,
        context,
      );
    }
    return dto;
  }

  // ==========================================================================
  // CAC METHOD DA GO KHOI `terminal` (giai doan 1 - cutover auth/identity)
  //
  // forgotPassword, createForgotPasswordToken, resendForgotPasswordToken,
  // confirmForgotPassword, ChangeForgotPassword, uploadAvatar, changePassword,
  // updateProfile, validateUser, generateToken, login, initiateRegister,
  // resendRegisterOtp, completeRegister, register, refresh, deleteAccount.
  //
  // Tat ca thuoc ve `shared-user` (identity service).
  //
  // ⛔ `generateToken` la thu PHAI go, khong phai "go cho gon": no la duong
  // ky JWT duy nhat cua `terminal` (`jwtService.sign`). Giu no lai thi
  // `terminal` van ky duoc token - va token do bi `shared-user` tu choi, ra
  // dung loai loi "dang nhap duoc ma goi gi cung 401". Kiem lai bang
  // `grep -rn "jwtService.sign(" src/` => phai ra 0 ket qua.
  // ==========================================================================
}
