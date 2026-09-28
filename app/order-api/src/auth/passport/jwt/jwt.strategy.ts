import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { jwtConstants } from '../../constants';
import { AuthJwtPayload } from '../../auth.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/user/user.entity';
import { Repository } from 'typeorm';
import { CurrentUserDto } from 'src/user/user.dto';
import { AuthUtils } from '../../auth.utils';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly authUtils: AuthUtils,
    private readonly clsService: ClsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
      usernameField: 'phonenumber',
    });
  }

  async validate(payload: AuthJwtPayload) {
    const user = await this.userRepository.findOne({
      where: {
        id: payload.sub,
      },
      relations: ['role.permissions.authority.authorityGroup'],
    });
    if (!user) throw new UnauthorizedException();

    //locked user
    if (!user.isActive) throw new UnauthorizedException();

    const scope = this.authUtils.buildScope(user);

    const userName =
      user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : user.phonenumber;
    const userSlug = user.slug;

    this.clsService.set('user', userName);
    this.clsService.set('userSlug', userSlug);
    return {
      userId: payload.sub,
      userName,
      scope: this.authUtils.parseScope(scope),
    } as CurrentUserDto;
  }
}
