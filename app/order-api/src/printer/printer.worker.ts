import { Inject, Injectable, Logger } from '@nestjs/common';
// import { Cron } from '@nestjs/schedule';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { PrinterJob } from './entity/printer-job.entity';
import { Repository, LessThan } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PrinterJobStatus } from './printer.constants';
import _ from 'lodash';
import { PrinterProducer } from './printer.producer';

const PENDING_THRESHOLD_MS = 60_000; // 1 minute
const PRINTING_THRESHOLD_MS = 120_000; // 2 minutes

@Injectable()
export class PrinterWorker {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    @InjectRepository(PrinterJob)
    private readonly printerJobRepository: Repository<PrinterJob>,
    private readonly printerProducer: PrinterProducer,
  ) {}

  /**
   * Recovery cron: re-queue stuck printer jobs every 30 seconds.
   * - PENDING jobs older than 1 minute (enqueue might have failed)
   * - PRINTING jobs older than 2 minutes (worker might have crashed)
   */
  // @Cron('*/30 * * * * *')
  async recoverStuckJobs() {
    const context = `${PrinterWorker.name}.${this.recoverStuckJobs.name}`;

    const now = new Date();
    const pendingThreshold = new Date(now.getTime() - PENDING_THRESHOLD_MS);
    const printingThreshold = new Date(now.getTime() - PRINTING_THRESHOLD_MS);

    const stuckJobs = await this.printerJobRepository.find({
      where: [
        {
          status: PrinterJobStatus.PENDING,
          updatedAt: LessThan(pendingThreshold),
        },
        {
          status: PrinterJobStatus.PRINTING,
          updatedAt: LessThan(printingThreshold),
        },
      ],
    });

    if (_.isEmpty(stuckJobs)) return;

    this.logger.warn(
      `Found ${stuckJobs.length} stuck printer jobs, re-queuing`,
      context,
    );

    for (const job of stuckJobs) {
      try {
        await this.printerJobRepository.update(job.id, {
          status: PrinterJobStatus.PENDING,
        });
        await this.printerProducer.enqueuePrinterJob(job.id);
        this.logger.log(`Re-queued printer job ${job.id}`, context);
      } catch (error: any) {
        this.logger.error(
          `Failed to re-queue printer job ${job.id}`,
          error.stack,
          context,
        );
      }
    }
  }
}
