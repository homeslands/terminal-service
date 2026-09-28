import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import { baseMapper } from 'src/app/base.mapper';
import { PrinterConnectorConfig } from './entities/printer-connector.entity';
import {
  CreatePrinterConnectorDto,
  PrinterConnectorResponseDto,
} from './printer-connector.dto';

@Injectable()
export class PrinterConnectorProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(mapper, CreatePrinterConnectorDto, PrinterConnectorConfig);
      createMap(
        mapper,
        PrinterConnectorConfig,
        PrinterConnectorResponseDto,
        extend(baseMapper(mapper)),
      );
    };
  }
}
