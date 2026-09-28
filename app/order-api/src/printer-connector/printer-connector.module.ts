import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { PrinterConnectorService } from './printer-connector.service';
import { PrinterConnectorController } from './printer-connector.controller';
import { PrinterConnectorProfile } from './printer-connector.mapper';
import { PrinterConnectorClient } from './printer-connector.client';
import { PrinterConnectorConfig } from './entities/printer-connector.entity';
import { Branch } from 'src/branch/branch.entity';
import { PrinterConnectorBuilder } from './printer-connector.builder';
import { PrinterConnectorUtils } from './printer-connector.utils';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([PrinterConnectorConfig, Branch]),
  ],
  controllers: [PrinterConnectorController],
  providers: [
    PrinterConnectorService,
    PrinterConnectorProfile,
    PrinterConnectorClient,
    PrinterConnectorBuilder,
    PrinterConnectorUtils,
  ],
  exports: [
    PrinterConnectorService,
    PrinterConnectorClient,
    PrinterConnectorBuilder,
    PrinterConnectorUtils,
  ],
})
export class PrinterConnectorModule {}
