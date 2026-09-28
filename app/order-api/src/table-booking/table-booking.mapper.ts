import {
  createMap,
  extend,
  forMember,
  mapFrom,
  Mapper,
} from '@automapper/core';
import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { Injectable } from '@nestjs/common';
import { TableBookingEntity } from './table-booking.entity';
import {
  CreateTableBookingDto,
  TableBookingResponseDto,
} from './table-booking.dto';
import { baseMapper } from 'src/app/base.mapper';
import { formatBookingDate } from './table-booking.validation';

@Injectable()
export class TableBookingProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(
        mapper,
        TableBookingEntity,
        TableBookingResponseDto,
        forMember(
          (dto) => dto.date,
          mapFrom((src) => formatBookingDate(src.date)),
        ),
        extend(baseMapper(mapper)),
      );

      createMap(mapper, CreateTableBookingDto, TableBookingEntity);
    };
  }
}
