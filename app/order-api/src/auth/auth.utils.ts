import { Injectable } from '@nestjs/common';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { UserScopeDto } from 'src/user/user.dto';
import { User } from 'src/user/user.entity';
import { AuthValidation } from './auth.validation';
import { AuthException } from './auth.exception';
import { RoleEnum } from 'src/role/role.enum';
import { Branch } from 'src/branch/branch.entity';
import { BranchResponseDto } from 'src/branch/branch.dto';
import {
  UserRequirementKey,
  UserRequirementLevel,
  UserRequirementStatus,
} from 'src/user/user.constant';

@Injectable()
export class AuthUtils {
  constructor(
    @InjectMapper()
    private readonly mapper: Mapper,
  ) {}

  buildScope(user: User): string {
    const scope: UserScopeDto = {
      role: user.role?.name,
      permissions: [],
      // `branch` di kem scope vi `GET /auth/scope` la nguon quyen DUY NHAT
      // cua UI sau cutover, va UI can branch de dieu huong/loc. Lay ban CUC
      // BO: branch la du lieu cua terminal, shared-user khong tra field nay.
      branch: user.branch
        ? this.mapper.map(user.branch, Branch, BranchResponseDto)
        : null,
    };

    const authorityGroupCodes = new Set<string>();
    user.role?.permissions.forEach((permission) => {
      if (!authorityGroupCodes.has(permission.authority.authorityGroup.code)) {
        authorityGroupCodes.add(permission.authority.authorityGroup.code);
      }
    });

    scope.permissions = Array.from(authorityGroupCodes);

    return JSON.stringify(scope);
  }

  parseScope(scope: string): UserScopeDto {
    return JSON.parse(scope);
  }
}

// `checkActiveUser` da bi go (thay bang `UserActiveChecker` trong
// src/external-services/shared-user-service/). No doc cot `is_active_column`
// cuc bo - thu se ngung duoc ghi tu dot "khoa tai khoan quy han ve
// shared-user" (architect-http.md muc 1.1), nen cang ngay cang lech. Sau khi
// go, khong con cho nao trong terminal doc cot do nua: day la dieu kien de
// giai doan sau drop duoc no.

export function checkUserRequirement(user: User): void {
  if (
    user.userRequirements.find(
      (requirement) =>
        requirement.key === UserRequirementKey.NEED_UPDATE_PASSWORD &&
        requirement.status === UserRequirementStatus.PENDING &&
        requirement.level === UserRequirementLevel.BLOCK,
    )
  ) {
    throw new AuthException(AuthValidation.NEED_UPDATE_PASSWORD);
  }
  if (
    user.userRequirements.find(
      (requirement) =>
        requirement.key === UserRequirementKey.NEED_UPDATE_PHONE_NUMBER &&
        requirement.status === UserRequirementStatus.PENDING &&
        requirement.level === UserRequirementLevel.BLOCK,
    )
  ) {
    throw new AuthException(AuthValidation.NEED_UPDATE_PHONE_NUMBER);
  }
}

export function isDefinedCustomer(user: User): boolean {
  if (
    user.role?.name === RoleEnum.Customer &&
    user.phonenumber !== 'default-customer'
  )
    return true;

  return false;
}
