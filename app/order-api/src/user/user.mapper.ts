import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import { User } from './user.entity';
import {
  CreateUserRequestDto,
  GeneralUserResponseDto,
  UserRequirementResponseDto,
  UserResponseDto,
} from './user.dto';
import { UserRequirement } from './user-requirement.entity';

// Buoc 8.8: identity da roi entity `User` (khong con cot, khong con
// `@AutoMap`). Automapper (`@automapper/core` 8, `createInitialMapping`) chi
// map field co trong METADATA cua class nguon, nen gia tri ghep tu shared-user
// vao entity TRUOC khi map (`mergeSharedUserIdentityInto` / `applyUserIdentity`
// - user long trong nhom khach, thanh vien nhom, voucher, chu don...) bi bo qua
// IM LANG, key bien mat khoi JSON (muc 1.4). Do 19/11/2026: `GET
// /user-group-member` mat ten, `GET /voucher` mat SDT/ten cua `assignedUser`.
// Khai `forMember` doc thang thuoc tinh da ghep tren object; khong ghep (khong
// co identity) => `null`, giu nguyen tap key cua response nhu khi con cot.
// `isActive` / hai co xac minh van gan tren DTO sau khi map
// (`assignNestedUserFlags`, buoc 3.4 / 4.7).
type MergedIdentity = User & {
  phonenumber?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  dob?: string | null;
  email?: string | null;
  address?: string | null;
  language?: string | null;
};
const merged = (source: User): MergedIdentity => source as MergedIdentity;

@Injectable()
export class UserProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      // QD22 (buoc 2.5) - `membershipCard` va `userRequirements` KHONG map tu
      // entity nua (quan he da go, nguon that o shared-user). Hai field van
      // co trong response (muc 1.4) nhung duoc gan SAU khi map, bang
      // `toMembershipCardResponse` / `toUserRequirementResponses` tu ket qua
      // `lookup` - xem UserService.mergeSharedUserIdentity va getAllUsers.
      createMap(
        mapper,
        User,
        UserResponseDto,
        forMember(
          (d) => d.phonenumber,
          mapFrom((s) => merged(s).phonenumber ?? null),
        ),
        forMember(
          (d) => d.firstName,
          mapFrom((s) => merged(s).firstName ?? null),
        ),
        forMember(
          (d) => d.lastName,
          mapFrom((s) => merged(s).lastName ?? null),
        ),
        forMember(
          (d) => d.dob,
          mapFrom((s) => merged(s).dob ?? null),
        ),
        forMember(
          (d) => d.email,
          mapFrom((s) => merged(s).email ?? null),
        ),
        forMember(
          (d) => d.address,
          mapFrom((s) => merged(s).address ?? null),
        ),
        forMember(
          (d) => d.language,
          mapFrom((s) => merged(s).language ?? null),
        ),
      );
      createMap(
        mapper,
        User,
        GeneralUserResponseDto,
        forMember(
          (d) => d.phonenumber,
          mapFrom((s) => merged(s).phonenumber ?? null),
        ),
        forMember(
          (d) => d.firstName,
          mapFrom((s) => merged(s).firstName ?? null),
        ),
        forMember(
          (d) => d.lastName,
          mapFrom((s) => merged(s).lastName ?? null),
        ),
      );
      createMap(mapper, CreateUserRequestDto, User);
      createMap(mapper, UserRequirement, UserRequirementResponseDto);
    };
  }
}
