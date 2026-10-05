import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { jwtConstants } from '../../constants';
import { AuthJwtPayload } from '../../auth.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/user/user.entity';
import { Repository } from 'typeorm';
import { CurrentUserDto } from 'src/user/user.dto';
import { AuthUtils } from '../../auth.utils';
import { ClsService } from 'nestjs-cls';
import { SharedUserServiceClient } from 'src/external-services/shared-user-service/shared-user-service.client';
import { UserValidation } from 'src/user/user.validation';
import { UserException } from 'src/user/user.exception';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { UserProvisioningService } from 'src/user/user-provisioning.service';

const RELATIONS = [
  'role.permissions.authority.authorityGroup',
  'branch.addressDetail',
];

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly authUtils: AuthUtils,
    private readonly clsService: ClsService,
    private readonly sharedUserServiceClient: SharedUserServiceClient,
    private readonly userProvisioningService: UserProvisioningService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // CHI verify, KHONG ky. `terminal` khong co private key - xem
      // auth/constants.ts va ghi chu tai auth.module.ts.
      secretOrKey: jwtConstants.publicKey,
      algorithms: [jwtConstants.algorithm],
      usernameField: 'phonenumber',
    });
  }

  async validate(payload: AuthJwtPayload) {
    const context = `${JwtStrategy.name}.${this.validate.name}`;

    // Khoa/mo khoa tai khoan quy het ve shared-user (architect-http.md muc
    // 1.1) - terminal khong con giu ban isActive cua rieng no nua, nen MOI
    // request co auth deu phai hoi lai identity that + trang thai khoa qua
    // day, khong dung du lieu cuc bo.
    //
    // Goi TRUOC KHI tra hang cuc bo, ke ca khi hang cuc bo da co: mot tai
    // khoan bi khoa ben shared-user phai bi chan ngay, khong duoc di tiep chi
    // vi terminal_db con cache cua no.
    const sharedUser = await this.sharedUserServiceClient
      .lookupById(payload.sub)
      .catch((error) => {
        this.logger.error(
          `Error looking up shared-user by id: ${error.message}`,
          error.stack,
          context,
        );
        throw new ServiceUnavailableException();
      });
    // Token da verify hop le bang public key cua shared-user, nen ve ly
    // thuyet luon tra ve duoc user - null chi xay ra neu tai khoan da bi xoa
    // ben shared-user sau khi token duoc phat hanh.
    if (!sharedUser) throw new UnauthorizedException();
    // Tai khoan bi khoa - chan hoan toan, khong cho request di tiep.
    if (!sharedUser.isActive) throw new UnauthorizedException();

    let user = await this.userRepository.findOne({
      where: {
        sharedUserId: payload.sub,
      },
      relations: RELATIONS,
    });

    if (!user) {
      // Lan dau user nay xuat hien o terminal (vd vua tu dang ky ben
      // shared-user, chua ai o terminal gan role cho ho) - tu tao hang toi
      // gian voi role Customer mac dinh, chan request lai cho toi khi tao
      // xong, khong tra role=null.
      //
      // Day la LOP 0 cua QD19, va dung chung `ensureLocalUser` voi ba lop con
      // lai - khong nhan ban vong insert (xem UserProvisioningService).
      try {
        user = await this.userProvisioningService.ensureLocalUser(
          sharedUser,
          RELATIONS,
        );
      } catch (error) {
        // CHI danh tinh cua service khac moi ra 401 (QD18: ho la nhan vien
        // cua service khac, theo quy tac nghiep vu khong duoc dung nhu khach
        // o terminal). Loi ha tang (DB tu choi, role Customer bi xoa) phai
        // giu nguyen ma cua no - quy het ve 401 la bien mot su co he thong
        // thanh "sai tai khoan", va nguoi di dieu tra se tim nham cho.
        if (
          error instanceof UserException &&
          error.errorCodeValue?.code ===
            UserValidation.USER_OWNED_BY_ANOTHER_SERVICE.code
        ) {
          this.logger.warn(
            `Reject login: sharedUserId=${sharedUser.id} belongs to another service`,
            context,
          );
          throw new UnauthorizedException();
        }
        throw error;
      }
    }

    const scope = this.authUtils.buildScope(user);

    // Ten hien thi cho audit-log (ClsService). Lay tu identity VUA tra ben
    // shared-user chu khong tu cache cuc bo: ho ten la field identity, cache
    // cuc bo co the da cu vi nguoi dung sua ho so thang ben shared-user.
    // Chi rot ve cache khi shared-user khong co ho ten.
    const firstName = sharedUser.firstName ?? user.firstName;
    const lastName = sharedUser.lastName ?? user.lastName;
    const userName =
      firstName && lastName
        ? `${firstName} ${lastName}`
        : (sharedUser.phonenumber ?? user.phonenumber);
    const userSlug = user.slug;

    this.clsService.set('user', userName);
    this.clsService.set('userSlug', userSlug);
    return {
      // userId = id CUC BO cua terminal (user_tbl.id), KHONG phai payload.sub
      // (id ben shared-user). Moi noi tieu thu CurrentUserDto trong terminal
      // deu dung field nay de tra hang cuc bo / gan quan he (AuthService
      // .getProfile, PaymentService, UserGroupService, work-shift,
      // table-booking, vat-request, audit-logs...), nen tra payload.sub vao
      // day se lam moi query cuc bo truot -> USER_NOT_FOUND rai rac o nhung
      // cho chang lien quan gi toi auth. Muon id ben shared-user thi doc
      // user.sharedUserId.
      userId: user.id,
      userName,
      scope: this.authUtils.parseScope(scope),
    } as CurrentUserDto;
  }
}
