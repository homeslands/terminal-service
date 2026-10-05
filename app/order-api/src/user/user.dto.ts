import { AutoMap } from '@automapper/classes';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional } from 'class-validator';
import { AccumulatedPointResponseDto } from 'src/accumulated-point/accumulated-point.dto';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';
import {
  // INVALID_FIRSTNAME,
  // INVALID_LASTNAME,
  INVALID_PASSWORD,
  INVALID_PHONENUMBER,
  INVALID_USERID,
} from 'src/auth/auth.validation';
import { BranchResponseDto } from 'src/branch/branch.dto';
import { RoleResponseDto } from 'src/role/role.dto';
import { INVALID_LANGUAGE } from './user.validation';
import { UserLanguage } from './user.constant';
import { MembershipCardResponseDto } from 'src/membership-card/membership-card.dto';
import { Matches } from 'class-validator';
export class CreateUserRequestDto {
  @ApiProperty()
  @IsNotEmpty({ message: INVALID_PHONENUMBER })
  @AutoMap()
  phonenumber: string;

  @ApiProperty()
  @IsNotEmpty({ message: INVALID_PASSWORD })
  password: string;

  @ApiProperty()
  // @IsNotEmpty({ message: INVALID_FIRSTNAME })
  @IsOptional()
  @AutoMap()
  firstName: string;

  @ApiProperty()
  // @IsNotEmpty({ message: INVALID_LASTNAME })
  @IsOptional()
  @AutoMap()
  lastName: string;

  @ApiProperty()
  @IsOptional()
  branch?: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'Invalid role' })
  role: string;

  @ApiProperty()
  @IsOptional()
  @Matches(/^(0[1-9]|[12]\d|3[0-1])\/(0[1-9]|1[0-2])\/(19|20)\d{2}$/, {
    message: 'Invalid day of birth format dd/mm/yyyy',
  })
  @AutoMap()
  dob?: string;

  @ApiProperty()
  @IsOptional()
  isVerifiedPhonenumber?: boolean;
}

export class UserScopeDto {
  @ApiProperty()
  role: string;

  @ApiProperty({ type: [String] })
  permissions: string[];

  @ApiProperty({ type: () => BranchResponseDto, nullable: true })
  branch: BranchResponseDto | null;
}

export class CurrentUserDto {
  @IsNotEmpty({ message: INVALID_USERID })
  userId: string;

  @IsNotEmpty()
  userName: string;

  @IsOptional()
  scope?: UserScopeDto;
}

export class UserResponseDto extends BaseResponseDto {
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
  readonly dob: string;

  @AutoMap()
  @ApiProperty()
  readonly email?: string;

  @AutoMap()
  @ApiProperty()
  readonly address: string;

  @AutoMap(() => BranchResponseDto)
  @ApiProperty({ type: () => BranchResponseDto })
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

  @AutoMap(() => AccumulatedPointResponseDto)
  @ApiProperty()
  accumulatedPoint: AccumulatedPointResponseDto;

  @AutoMap()
  isActive: boolean;

  @AutoMap()
  language: string;

  @AutoMap(() => MembershipCardResponseDto)
  @ApiProperty({ type: () => MembershipCardResponseDto })
  membershipCard: MembershipCardResponseDto;

  @AutoMap(() => UserRequirementResponseDto)
  @ApiProperty({ type: () => UserRequirementResponseDto })
  userRequirements: UserRequirementResponseDto[];
}

export class GeneralUserResponseDto extends BaseResponseDto {
  @ApiProperty()
  @AutoMap()
  readonly phonenumber: string;

  @ApiProperty()
  @AutoMap()
  readonly firstName: string;

  @ApiProperty()
  @AutoMap()
  readonly lastName: string;
}

export class UpdateUserRoleRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  role: string;
}

export class UpdateUserRequestDto {
  @ApiProperty()
  // @IsNotEmpty({ message: INVALID_FIRSTNAME })
  @IsOptional()
  firstName: string;

  @ApiProperty()
  // @IsNotEmpty({ message: INVALID_LASTNAME })
  @IsOptional()
  lastName: string;

  @IsOptional()
  @Matches(/^(0[1-9]|[12]\d|3[0-1])\/(0[1-9]|1[0-2])\/(19|20)\d{2}$/, {
    message: 'Invalid day of birth format dd/mm/yyyy',
  })
  @ApiProperty({ example: '01/01/1990' })
  // @IsNotEmpty({ message: INVALID_DOB })
  dob?: string;

  @ApiProperty()
  @IsOptional()
  email?: string;

  @ApiProperty()
  @IsOptional()
  address?: string;

  @ApiProperty()
  @IsOptional()
  branch?: string;
}

export class CompleteUserRegistrationRequestDto {
  @ApiProperty()
  @IsNotEmpty({ message: INVALID_PHONENUMBER })
  @AutoMap()
  phonenumber: string;

  // @ApiProperty()
  // @IsNotEmpty({ message: INVALID_PASSWORD })
  // password: string;
}

export class GetAllUserQueryRequestDto extends BaseQueryDto {
  @AutoMap()
  @ApiProperty({
    description: 'The slug of branch',
    example: '',
    required: false,
  })
  @IsOptional()
  branch?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  phonenumber: string;

  @ApiProperty({
    description: 'The slug of user',
    example: '',
    required: false,
  })
  @IsOptional()
  slug?: string;

  @ApiProperty({
    description: 'The code of membership card',
    example: '',
    required: false,
  })
  @IsOptional()
  membershipCard?: string;

  @AutoMap()
  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',') : [value],
  )
  role: string[] = [];

  @AutoMap()
  @ApiProperty({
    description: 'Enable paging',
    required: false,
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return true; // Default true
    return value === 'true'; // Transform 'true' to `true` and others to `false`
  })
  hasPaging?: boolean;
}

export class UpdateUserLanguageRequestDto {
  @ApiProperty()
  @IsNotEmpty({ message: INVALID_LANGUAGE })
  @IsEnum(UserLanguage, { message: INVALID_LANGUAGE })
  language: string;
}

export class UserRequirementResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  key: string;

  @AutoMap()
  @ApiProperty()
  status: string;

  @AutoMap()
  @ApiProperty()
  level: string;

  @AutoMap()
  @ApiProperty()
  scope: string;

  @AutoMap()
  @ApiProperty()
  expiredAt: string;

  @AutoMap()
  @ApiProperty()
  lastUpdatedAt: string;
}

// QD16-bis - cua HEP tra NGUOI NHAN the qua, thay cho `GET /user` o man KHACH.
export class LookupRecipientQueryRequestDto {
  @ApiProperty({
    description:
      'So dien thoai NGUOI NHAN - khop tuyet doi, khong phai chuoi con',
    example: '0912345678',
  })
  @IsNotEmpty({ message: INVALID_PHONENUMBER })
  phonenumber: string;
}

// CO TINH HEP hon UserResponseDto: dung BON field. Man KHACH khong duoc thay
// email / dob / address / role / diem / vi cua nguoi khac - do la ca ly do
// route `lookup-recipient` ton tai. Dung mo rong DTO nay.
//
// ⚠️ Trung TEN voi `RecipientResponseDto` cua
// `gift-card-modules/receipient/dto/recipient-response.dto.ts` nhung la HAI
// DTO KHAC NHAU (ben do la nguoi nhan cua mot don the qua: name/quantity/
// status/message/phone). Dung import lan.
export class RecipientResponseDto {
  @ApiProperty()
  slug: string;

  @ApiProperty()
  phonenumber: string;

  @ApiProperty({ required: false })
  firstName?: string;

  @ApiProperty({ required: false })
  lastName?: string;
}
