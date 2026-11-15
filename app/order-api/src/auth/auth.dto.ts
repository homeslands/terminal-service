import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { AutoMap } from '@automapper/classes';
import { BranchResponseDto } from 'src/branch/branch.dto';
import { RoleResponseDto } from 'src/role/role.dto';
import { UserRequirementResponseDto } from 'src/user/user.dto';

/**
 * Buoc 3.3 (giai doan 3) - tep nay chi con DUNG HAI class:
 * `AuthProfileResponseDto` (route `GET /auth/profile`) va `AuthJwtPayload`
 * (`JwtStrategy` doc payload token).
 *
 * Hai muoi ba class kia da xoa. Chung phuc vu dang nhap / dang ky / quen mat
 * khau / xac minh email-SDT - nhung nghiep vu thuoc ve `shared-user` tu giai
 * doan 1, va sau buoc 3.2 khong con route hay method nao o day doc chung.
 * Do 12/11/2026 TUNG class mot: ngoai thu muc `auth/` khong tep nao import
 * chung; ba ngoai le la `VerifyPhoneNumberResponseDto` (chi
 * `zalo-oa-connector.mapper.ts` dung), `ForgotPasswordResponseDto` va
 * `InitiateRegisterResponseDto` (chi `auth.mapper.ts` dung) - ca ba map do
 * cung bi xoa trong chinh buoc nay.
 *
 * GIU `isVerifiedEmail` / `isVerifiedPhonenumber` tren DTO phan hoi: hai field
 * nay lay gia tri tu identity cua `shared-user` (xem `auth.service.ts`),
 * khong phai tu cot cuc bo - bo chung la doi shape phan hoi (muc 1.4), va cot
 * cuc bo thi den giai doan 4.7 moi doi ten.
 */
export class AuthProfileResponseDto {
  @AutoMap()
  @ApiProperty()
  readonly slug: string;

  @ApiProperty()
  @AutoMap()
  readonly phonenumber: string;

  @ApiProperty()
  @AutoMap()
  readonly firstName?: string;

  @ApiProperty()
  @AutoMap()
  readonly lastName?: string;

  @AutoMap()
  @ApiProperty()
  @Matches(/^(0[1-9]|[12]\d|3[0-1])\/(0[1-9]|1[0-2])\/(19|20)\d{2}$/, {
    message: 'Invalid day of birth format dd/mm/yyyy',
  })
  readonly dob: string;

  @AutoMap()
  @ApiProperty()
  readonly email?: string;

  @AutoMap()
  @ApiProperty()
  readonly address: string;

  @AutoMap()
  @ApiProperty()
  readonly image: string;

  @AutoMap(() => BranchResponseDto)
  @ApiProperty()
  readonly branch: BranchResponseDto;

  @AutoMap(() => RoleResponseDto)
  @ApiProperty()
  role: RoleResponseDto;

  @AutoMap()
  @ApiProperty()
  isVerifiedEmail: boolean;

  @AutoMap()
  @ApiProperty()
  isVerifiedPhonenumber: boolean;

  @AutoMap()
  @ApiProperty()
  readonly language: string;

  @AutoMap(() => UserRequirementResponseDto)
  @ApiProperty({ type: () => UserRequirementResponseDto })
  userRequirements: UserRequirementResponseDto[];
}

export class AuthJwtPayload {
  sub: string;
  jti: string;
  exp?: number;
}
