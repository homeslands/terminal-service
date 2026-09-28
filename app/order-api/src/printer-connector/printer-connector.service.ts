import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { PrinterConnectorConfig } from './entities/printer-connector.entity';
import {
  CreatePrinterConnectorDto,
  UpdatePrinterConnectorDto,
  PrinterConnectorResponseDto,
} from './printer-connector.dto';
import { PrinterConnectorException } from './printer-connector.exception';
import { PrinterConnectorValidation } from './printer-connector.validation';
import { Branch } from 'src/branch/branch.entity';
import { BranchException } from 'src/branch/branch.exception';
import { BranchValidation } from 'src/branch/branch.validation';

@Injectable()
export class PrinterConnectorService {
  constructor(
    @InjectRepository(PrinterConnectorConfig)
    private readonly printerConnectorRepository: Repository<PrinterConnectorConfig>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectMapper() private mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
  ) {}

  async create(
    createDto: CreatePrinterConnectorDto,
  ): Promise<PrinterConnectorResponseDto> {
    const context = `${PrinterConnectorService.name}.${this.create.name}`;
    this.logger.log(
      `Create printer connector config for branch ${createDto.branchSlug}`,
      context,
    );

    const branch = await this.branchRepository.findOne({
      where: { slug: createDto.branchSlug },
    });
    if (!branch) throw new BranchException(BranchValidation.BRANCH_NOT_FOUND);

    const existing = await this.printerConnectorRepository.findOne({
      where: { branch: { slug: createDto.branchSlug } },
    });
    if (existing) {
      throw new PrinterConnectorException(
        PrinterConnectorValidation.PRINTER_CONNECTOR_ALREADY_EXISTS,
      );
    }

    const config = this.mapper.map(
      createDto,
      CreatePrinterConnectorDto,
      PrinterConnectorConfig,
    );
    Object.assign(config, { branch });

    try {
      const created = await this.printerConnectorRepository.save(config);
      this.logger.log(
        `Printer connector config ${created.slug} created successfully`,
        context,
      );
      const result = await this.printerConnectorRepository.findOne({
        where: { slug: created.slug },
        relations: { branch: true },
      });
      return this.mapper.map(
        result,
        PrinterConnectorConfig,
        PrinterConnectorResponseDto,
      );
    } catch (error) {
      this.logger.error(
        `Error when creating printer connector config: ${JSON.stringify(error)}`,
        context,
      );
      throw new PrinterConnectorException(
        PrinterConnectorValidation.CREATE_PRINTER_CONNECTOR_ERROR,
        `Error when creating printer connector config: ${error.message}`,
      );
    }
  }

  async findByBranch(branchSlug: string): Promise<PrinterConnectorResponseDto> {
    const config = await this.printerConnectorRepository.findOne({
      where: { branch: { slug: branchSlug } },
      relations: { branch: true },
    });
    if (!config) {
      throw new PrinterConnectorException(
        PrinterConnectorValidation.PRINTER_CONNECTOR_NOT_FOUND,
      );
    }
    return this.mapper.map(
      config,
      PrinterConnectorConfig,
      PrinterConnectorResponseDto,
    );
  }

  async update(
    slug: string,
    updateDto: UpdatePrinterConnectorDto,
  ): Promise<PrinterConnectorResponseDto> {
    const context = `${PrinterConnectorService.name}.${this.update.name}`;

    const config = await this.printerConnectorRepository.findOne({
      where: { slug },
      relations: { branch: true },
    });
    if (!config) {
      throw new PrinterConnectorException(
        PrinterConnectorValidation.PRINTER_CONNECTOR_NOT_FOUND,
      );
    }

    Object.assign(config, updateDto);

    try {
      const updated = await this.printerConnectorRepository.save(config);
      this.logger.log(
        `Printer connector config ${updated.slug} updated successfully`,
        context,
      );
      return this.mapper.map(
        updated,
        PrinterConnectorConfig,
        PrinterConnectorResponseDto,
      );
    } catch (error) {
      this.logger.error(
        `Error when updating printer connector config: ${JSON.stringify(error)}`,
        context,
      );
      throw new PrinterConnectorException(
        PrinterConnectorValidation.UPDATE_PRINTER_CONNECTOR_ERROR,
        `Error when updating printer connector config: ${error.message}`,
      );
    }
  }

  async remove(slug: string): Promise<void> {
    const context = `${PrinterConnectorService.name}.${this.remove.name}`;

    const config = await this.printerConnectorRepository.findOne({
      where: { slug },
      relations: { branch: true },
    });
    if (!config) {
      throw new PrinterConnectorException(
        PrinterConnectorValidation.PRINTER_CONNECTOR_NOT_FOUND,
      );
    }

    try {
      await this.printerConnectorRepository.remove(config);
      this.logger.log(`Printer connector config deleted successfully`, context);
    } catch (error) {
      this.logger.error(
        `Error when deleting printer connector config: ${JSON.stringify(error)}`,
        context,
      );
      throw new PrinterConnectorException(
        PrinterConnectorValidation.DELETE_PRINTER_CONNECTOR_ERROR,
        `Error when deleting printer connector config: ${error.message}`,
      );
    }
  }
}
