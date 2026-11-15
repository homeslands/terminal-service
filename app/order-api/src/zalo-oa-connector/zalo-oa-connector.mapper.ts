import { createMap } from '@automapper/core';
import { Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import {
  CreateZaloOaConnectorConfigRequestDto,
  ZaloOaConnectorConfigResponseDto,
} from './zalo-oa-connector.dto';
import { ZaloOaConnectorConfig } from './entity/zalo-oa-connector.entity';
import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';

@Injectable()
export class ZaloOaConnectorProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(
        mapper,
        CreateZaloOaConnectorConfigRequestDto,
        ZaloOaConnectorConfig,
      );
      createMap(
        mapper,
        ZaloOaConnectorConfig,
        ZaloOaConnectorConfigResponseDto,
      );
    };
  }
}
