import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';

import { baseMapper } from 'src/app/base.mapper';
import { CardOrderRevenue } from './entities/card-order-revenue.entity';
import { CardOrderRevenueResponseDto } from './dto/card-order-revenue-response.dto';

@Injectable()
export class CardOrderRevenueProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(mapper, CardOrderRevenue, CardOrderRevenueResponseDto, extend(baseMapper(mapper)));
    };
  }
}
