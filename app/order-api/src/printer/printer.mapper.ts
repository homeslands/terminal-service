import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import {
  createMap,
  extend,
  forMember,
  mapFrom,
  Mapper,
  mapWith,
} from '@automapper/core';
import { Injectable } from '@nestjs/common';
import { Printer } from './entity/printer.entity';
import {
  CreatePrinterRequestDto,
  PrinterJobResponseDto,
  PrinterResponseDto,
  UpdatePrinterRequestDto,
} from './printer.dto';
import { PrinterJob } from './entity/printer-job.entity';
import {
  CreatePrinterEventDto,
  PrinterEventResponseDto,
} from './printer-event/printer-event.dto';
import { PrinterEvent } from './entity/printer-event.entity';
import { baseMapper } from 'src/app/base.mapper';

@Injectable()
export class PrinterProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(mapper, Printer, PrinterResponseDto);
      createMap(mapper, CreatePrinterRequestDto, Printer);
      createMap(mapper, UpdatePrinterRequestDto, Printer);
      createMap(mapper, PrinterJob, PrinterJobResponseDto);
      createMap(
        mapper,
        CreatePrinterEventDto,
        PrinterEvent,
        forMember(
          (d) => d.metadata,
          mapFrom((s) => JSON.stringify(s.metadata)),
        ),
      );
      createMap(
        mapper,
        PrinterEvent,
        PrinterEventResponseDto,
        forMember(
          (destination) => destination.printerJob,
          mapWith(
            PrinterJobResponseDto,
            PrinterJob,
            (source) => source.printerJob,
          ),
        ),
        forMember(
          (d) => d.metadata,
          mapFrom((s) => s.metadata),
        ),
        extend(baseMapper(mapper)),
      );
    };
  }
}
