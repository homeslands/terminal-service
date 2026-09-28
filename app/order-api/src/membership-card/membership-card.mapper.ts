import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import {
  createMap,
  extend,
  forMember,
  mapFrom,
  Mapper,
} from '@automapper/core';
import { Injectable } from '@nestjs/common';

import { baseMapper } from 'src/app/base.mapper';
import { MembershipCard } from './membership-card.entity';
import {
  CreateMembershipCardDto,
  MembershipCardResponseDto,
  ReplaceMembershipCardDto,
} from './membership-card.dto';
import moment from 'moment';

@Injectable()
export class MembershipCardProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(
        mapper,
        MembershipCard,
        MembershipCardResponseDto,
        extend(baseMapper(mapper)),
      );
      createMap(
        mapper,
        CreateMembershipCardDto,
        MembershipCard,
        forMember(
          (destination) => destination.expiredAt,
          mapFrom((source) => {
            const date = new Date(
              moment(source.expiredAt)
                .endOf('day')
                .format('YYYY-MM-DD HH:mm:ss'),
            );
            return date;
          }),
        ),
      );
      createMap(
        mapper,
        ReplaceMembershipCardDto,
        MembershipCard,
        forMember(
          (destination) => destination.expiredAt,
          mapFrom((source) => {
            const date = new Date(
              moment(source.expiredAt)
                .endOf('day')
                .format('YYYY-MM-DD HH:mm:ss'),
            );
            return date;
          }),
        ),
      );
    };
  }
}
