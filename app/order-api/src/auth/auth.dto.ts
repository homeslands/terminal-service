import { ApiProperty } from '@nestjs/swagger';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import {
  // INVALID_DOB,
  // INVALID_EMAIL,
  // INVALID_FIRSTNAME,
  // INVALID_LASTNAME,
  INVALID_PASSWORD,
  INVALID_PHONENUMBER,
} from './auth.validation';
import { AutoMap } from '@automapper/classes';
import { BranchResponseDto } from 'src/branch/branch.dto';
import { RoleResponseDto } from 'src/role/role.dto';
import { VerificationMethod } from './auth.constants';
import { UserRequirementResponseDto } from 'src/user/user.dto';

export class LoginAuthRequestDto {
  @ApiProperty({ example: '0376295216' })
  @IsNotEmpty({ message: INVALID_PHONENUMBER })
  @AutoMap()
  phonenumber: string;

  @ApiProperty({ example: 'password' })
  @IsNotEmpty({
    message: INVALID_PASSWORD,
  })
  @AutoMap()
  password: string;
}
export class RegisterAuthRequestDto extends LoginAuthRequestDto {
  @ApiProperty({ example: 'John' })
  // @IsNotEmpty({ message: INVALID_FIRSTNAME })
  @IsOptional()
  @AutoMap()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  // @IsNotEmpty({ message: INVALID_LASTNAME })
  @IsOptional()
  @AutoMap()
  lastName: string;

  @ApiProperty()
  // @IsNotEmpty({ message: INVALID_EMAIL })
  @IsOptional()
  @AutoMap()
  email?: string;

  @ApiProperty()
  @IsOptional()
  @AutoMap()
  @Matches(/^(0[1-9]|[12]\d|3[0-1])\/(0[1-9]|1[0-2])\/(19|20)\d{2}$/, {
    message: 'Invalid day of birth format dd/mm/yyyy',
  }) // @IsNotEmpty({ message: INVALID_DOB })
  dob?: string;
}

export class DeleteAccountRequestDto {
  @ApiProperty({ example: 'password' })
  @IsNotEmpty({ message: INVALID_PASSWORD })
  @IsString()
  password: string;
}

export class LoginAuthResponseDto {
  @ApiProperty()
  readonly accessToken: string;

  @ApiProperty()
  readonly refreshToken: string;

  @ApiProperty()
  readonly expireTime: string;

  @ApiProperty()
  readonly expireTimeRefreshToken: string;
}

export class AuthRefreshRequestDto {
  @ApiProperty()
  @AutoMap()
  @IsString()
  accessToken: string;

  @ApiProperty()
  @AutoMap()
  @IsString()
  refreshToken: string;
}
export class AuthChangePasswordRequestDto {
  @ApiProperty()
  @AutoMap()
  @IsString()
  oldPassword: string;

  @ApiProperty()
  @AutoMap()
  @IsString()
  newPassword: string;
}

export class ForgotPasswordTokenRequestDto {
  @ApiProperty()
  @AutoMap()
  @IsOptional()
  email?: string;

  @ApiProperty()
  @AutoMap()
  @IsOptional()
  phonenumber?: string;

  @ApiProperty()
  @AutoMap()
  @IsNotEmpty()
  @IsString()
  @IsEnum(VerificationMethod)
  verificationMethod: string;
}

export class ConfirmForgotPasswordRequestDto {
  @ApiProperty()
  @AutoMap()
  @IsString()
  code: string;
}
export class ChangeForgotPasswordRequestDto {
  @ApiProperty()
  @AutoMap()
  @IsString()
  newPassword: string;

  @ApiProperty()
  @AutoMap()
  @IsString()
  token: string;
}
export class ConfirmForgotPasswordResponseDto {
  @ApiProperty()
  @AutoMap()
  @IsString()
  token: string;
}

export class ForgotPasswordRequestDto {
  @ApiProperty()
  @AutoMap()
  @IsString()
  token: string;

  @ApiProperty()
  @AutoMap()
  @IsString()
  newPassword: string;
}

export class ForgotPasswordResponseDto {
  @ApiProperty()
  @AutoMap()
  @IsDate()
  expiresAt: Date;
}

export class InitiateVerifyEmailRequestDto {
  @ApiProperty()
  @AutoMap()
  @IsString()
  email: string;
}
export class VerifyEmailResponseDto {
  @ApiProperty()
  @AutoMap()
  @IsDate()
  expiresAt: Date;
}
export class VerifyPhoneNumberResponseDto {
  @ApiProperty()
  @AutoMap()
  @IsDate()
  expiresAt: Date;
}
export class ConfirmEmailVerificationCodeRequestDto {
  @ApiProperty()
  @AutoMap()
  @IsString()
  code: string;
}
export class ConfirmPhoneNumberVerificationCodeRequestDto {
  @ApiProperty()
  @AutoMap()
  @IsString()
  code: string;
}

export class UpdateAuthProfileRequestDto {
  @ApiProperty({ example: 'John' })
  @AutoMap()
  // @IsNotEmpty({ message: INVALID_FIRSTNAME })
  @IsOptional()
  readonly firstName?: string;

  @ApiProperty({ example: 'Doe' })
  @AutoMap()
  // @IsNotEmpty({ message: INVALID_LASTNAME })
  @IsOptional()
  readonly lastName?: string;

  @ApiProperty({ example: '01/01/1990' })
  @AutoMap()
  @IsOptional()
  @Matches(/^(0[1-9]|[12]\d|3[0-1])\/(0[1-9]|1[0-2])\/(19|20)\d{2}$/, {
    message: 'Invalid day of birth format dd/mm/yyyy',
  })
  readonly dob?: string;

  @ApiProperty({ example: 'johndoe@gmail.com' })
  @AutoMap()
  @IsOptional()
  readonly email?: string;

  @ApiProperty({ example: 'Jl. Raya' })
  @AutoMap()
  readonly address: string;

  @ApiProperty({ example: 'XOT7hr58Q' })
  @AutoMap()
  readonly branch: string;
}

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

// PickType: Get the fields from AuthProfileResponseDto
export class RegisterAuthResponseDto {
  @ApiProperty()
  @AutoMap()
  slug: string;

  @ApiProperty()
  @AutoMap()
  phonenumber: string;

  @ApiProperty()
  @AutoMap()
  firstName?: string;

  @ApiProperty()
  @AutoMap()
  lastName?: string;
}

export class InitiateRegisterRequestDto {
  @ApiProperty({ example: '0376295216' })
  @IsNotEmpty({ message: INVALID_PHONENUMBER })
  phonenumber: string;
}

export class InitiateRegisterResponseDto {
  @ApiProperty()
  @AutoMap()
  expiresAt: Date;
}

export class ResendRegisterOtpRequestDto {
  @ApiProperty({ example: '0376295216' })
  @IsNotEmpty({ message: INVALID_PHONENUMBER })
  phonenumber: string;
}

export class CompleteRegisterRequestDto {
  @ApiProperty({ example: '0376295216' })
  @IsNotEmpty({ message: INVALID_PHONENUMBER })
  phonenumber: string;

  @ApiProperty({ example: 'A1B2C3' })
  @IsString()
  @IsNotEmpty()
  otp: string;

  @ApiProperty({ example: 'password' })
  @IsNotEmpty({ message: INVALID_PASSWORD })
  password: string;

  @ApiProperty({ example: 'John', required: false })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({ example: 'Doe', required: false })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(/^(0[1-9]|[12]\d|3[0-1])\/(0[1-9]|1[0-2])\/(19|20)\d{2}$/, {
    message: 'Invalid day of birth format dd/mm/yyyy',
  })
  dob?: string;
}

export class AuthJwtPayload {
  sub: string;
  jti: string;
  scope?: string;
  exp?: number;
}
