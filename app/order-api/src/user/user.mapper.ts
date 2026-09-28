import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, forMember, Mapper, mapWith } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import { User } from './user.entity';
import {
  CreateUserRequestDto,
  GeneralUserResponseDto,
  UserRequirementResponseDto,
  UserResponseDto,
} from './user.dto';
import { MembershipCard } from 'src/membership-card/membership-card.entity';
import { MembershipCardResponseDto } from 'src/membership-card/membership-card.dto';
import { UserRequirement } from './user-requirement.entity';

@Injectable()
export class UserProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(
        mapper,
        User,
        UserResponseDto,
        forMember(
          (destination) => destination.membershipCard,
          mapWith(
            MembershipCardResponseDto,
            MembershipCard,
            (source) => source.membershipCard,
          ),
        ),
        forMember(
          (destination) => destination.userRequirements,
          mapWith(
            UserRequirementResponseDto,
            UserRequirement,
            (source) => source.userRequirements,
          ),
        ),
      );
      createMap(mapper, User, GeneralUserResponseDto);
      createMap(mapper, CreateUserRequestDto, User);
      createMap(mapper, UserRequirement, UserRequirementResponseDto);
    };
  }
}
