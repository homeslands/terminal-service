import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import { User } from './user.entity';
import {
  CreateUserRequestDto,
  GeneralUserResponseDto,
  UserRequirementResponseDto,
  UserResponseDto,
} from './user.dto';
import { UserRequirement } from './user-requirement.entity';

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
      createMap(mapper, User, UserResponseDto);
      createMap(mapper, User, GeneralUserResponseDto);
      createMap(mapper, CreateUserRequestDto, User);
      createMap(mapper, UserRequirement, UserRequirementResponseDto);
    };
  }
}
