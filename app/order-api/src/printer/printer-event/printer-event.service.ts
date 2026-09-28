import { PrinterEvent } from '../entity/printer-event.entity';
import { In, Repository } from 'typeorm';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  CreatePrinterEventDto,
  GetPrinterEventsRequestDto,
  PrinterEventResponseDto,
} from './printer-event.dto';
import { Inject } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { FirebaseDeviceToken } from 'src/notification/firebase/firebase-device-token.entity';
import { FirebaseService } from 'src/notification/firebase/firebase.service';
import { FirebaseTokenDto } from 'src/notification/firebase/firebase.dto';
import { FirebasePlatform } from 'src/notification/firebase/firebase.constant';
import { FirebaseSendNotificationDto } from 'src/notification/firebase/firebase.dto';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { User } from 'src/user/user.entity';
import { UserException } from 'src/user/user.exception';
import { UserValidation } from 'src/user/user.validation';
import { PrinterEventRetryStatus } from './printer-event.constants';
import { PrinterJob } from '../entity/printer-job.entity';
import { PrinterException } from '../printer.exception';
import PrinterValidation from '../printer.validation';

@Injectable()
export class PrinterEventService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    private readonly transactionManagerService: TransactionManagerService,
    @InjectRepository(FirebaseDeviceToken)
    private readonly firebaseDeviceTokenRepository: Repository<FirebaseDeviceToken>,
    private readonly firebaseService: FirebaseService,
    @InjectMapper()
    private readonly mapper: Mapper,
    @InjectRepository(PrinterEvent)
    private readonly printerEventRepository: Repository<PrinterEvent>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(PrinterJob)
    private readonly printerJobRepository: Repository<PrinterJob>,
  ) {}

  async create(data: CreatePrinterEventDto): Promise<PrinterEvent> {
    const context = `${PrinterEvent.name}.${this.create.name}`;

    let createdPrinterEvent: PrinterEvent | null = null;
    if (data.existedPrinterEvent) {
      createdPrinterEvent = await this.printerEventRepository.findOne({
        where: { id: data.existedPrinterEvent },
      });
      if (createdPrinterEvent) {
        createdPrinterEvent.retryTime += 1;
        createdPrinterEvent =
          await this.printerEventRepository.save(createdPrinterEvent);
      }
    } else {
      const printerEvent = this.mapper.map(
        data,
        CreatePrinterEventDto,
        PrinterEvent,
      );

      const printerJob = await this.printerJobRepository.findOne({
        where: { id: data.printerJobId },
      });
      printerEvent.retryStatus = PrinterEventRetryStatus.FAILED;
      printerEvent.printerJob = printerJob;

      createdPrinterEvent =
        await this.transactionManagerService.execute<PrinterEvent>(
          async (manager) => {
            return await manager.save(printerEvent);
          },
          (result) => {
            this.logger.log(`Printer event created: ${result.id}`, context);
          },
          (error) => {
            this.logger.error(
              `Error creating printer event: ${error.message}`,
              error.stack,
              context,
            );
            return null;
          },
        );

      createdPrinterEvent = await this.printerEventRepository.findOne({
        where: { id: createdPrinterEvent.id },
      });
    }

    if (!createdPrinterEvent) {
      return;
    }

    // send notification to firebase fcm server
    try {
      const deviceTokens = await this.firebaseDeviceTokenRepository.find({
        where: { userId: createdPrinterEvent.receiverId },
        select: {
          id: true,
          token: true,
          platform: true,
        },
      });

      if (deviceTokens.length === 0) {
        this.logger.warn(
          `No device tokens for user ${createdPrinterEvent.receiverId}`,
          context,
        );
        return createdPrinterEvent;
      }

      const tokensWithPlatform: Array<FirebaseTokenDto> = deviceTokens.map(
        (dt) => ({
          token: dt.token,
          platform: dt.platform as FirebasePlatform,
        }),
      );

      const metadata = JSON.stringify(createdPrinterEvent.metadata);

      const fcmData: FirebaseSendNotificationDto = {
        title: createdPrinterEvent.title || '',
        body: createdPrinterEvent.body || '',
        link: createdPrinterEvent.link || '',
        data: {
          payload: JSON.stringify({
            slug: createdPrinterEvent.slug,
            type: createdPrinterEvent.type,
            message: createdPrinterEvent.message,
            receiverId: createdPrinterEvent.receiverId,
            createdAt: createdPrinterEvent.createdAt.toISOString(),
            route: createdPrinterEvent.link || '',
            metadata,
          }),
        },
      };

      const result = await this.firebaseService.sendToAllPlatforms(
        tokensWithPlatform,
        fcmData,
      );

      if (result.failedTokens && result.failedTokens.length > 0) {
        const failedDeviceTokens = await this.firebaseDeviceTokenRepository.find({
          where: { token: In(result.failedTokens) },
        });
        await this.firebaseDeviceTokenRepository.remove(failedDeviceTokens);
        this.logger.warn(
          `Failed tokens when FCM for firebase: ${result.failedTokens}`,
          context,
        );
        this.logger.warn(
          `Removed ${result.failedTokens.length} invalid tokens for user ${createdPrinterEvent.receiverId} when sending notification to firebase fcm server`,
          context,
        );
        return createdPrinterEvent;
      }

      return createdPrinterEvent;
    } catch (error) {
      this.logger.error(
        `Error when sending notification to firebase fcm server: ${error.message}`,
        error.stack,
        context,
      );
      return createdPrinterEvent;
    }
  }

  async findAll(
    options: GetPrinterEventsRequestDto,
  ): Promise<AppPaginatedResponseDto<PrinterEventResponseDto>> {
    const context = `${PrinterEventService.name}.${this.findAll.name}`;

    const query = this.printerEventRepository
      .createQueryBuilder('printerEvent')
      .leftJoinAndSelect('printerEvent.printerJob', 'printerJob')
      .orderBy('printerEvent.createdAt', 'DESC')
      .limit(options.size)
      .offset((options.page - 1) * options.size);

    if (options.retryStatus) {
      query.andWhere('printerEvent.retryStatus = :retryStatus', {
        retryStatus: options.retryStatus,
      });
    }

    if (options.type) {
      query.andWhere('printerEvent.type = :type', {
        type: options.type,
      });
    }

    if (options.receiver) {
      const receiver = await this.userRepository.findOne({
        where: { slug: options.receiver },
      });

      if (!receiver) {
        this.logger.warn(`Receiver not found`, context);
        throw new UserException(UserValidation.USER_NOT_FOUND);
      }

      query.andWhere('printerEvent.receiverId = :receiverId', {
        receiverId: receiver.id,
      });
    }

    if (options.startDate && options.endDate) {
      if (options.startDate > options.endDate) {
        this.logger.warn('Start date must be before end date', context);
        throw new PrinterException(
          PrinterValidation.START_DATE_MUST_BE_BEFORE_END_DATE,
        );
      }
      query.andWhere('printerEvent.createdAt BETWEEN :startDate AND :endDate', {
        startDate: options.startDate,
        endDate: options.endDate,
      });
    }

    if (options.startDate && !options.endDate) {
      const now = new Date();
      if (options.startDate > now) {
        this.logger.warn('Start date must be before now', context);
        throw new PrinterException(
          PrinterValidation.START_DATE_MUST_BE_BEFORE_NOW,
        );
      }
      query.andWhere('printerEvent.createdAt BETWEEN :startDate AND :now', {
        startDate: options.startDate,
        now: now,
      });
    }

    if (!options.startDate && options.endDate) {
      const now = new Date();
      if (options.endDate > now) {
        this.logger.warn('End date must be before now', context);
        throw new PrinterException(
          PrinterValidation.END_DATE_MUST_BE_BEFORE_NOW,
        );
      }
      query.andWhere('printerEvent.createdAt BETWEEN :now AND :endDate', {
        now: now,
        endDate: options.endDate,
      });
    }

    const printerEvents = await query.getMany();
    const total = await query.getCount();
    const totalPages = Math.ceil(total / options.size);
    const hasNext = options.page < totalPages;
    const hasPrevious = options.page > 1;

    return {
      hasNext: hasNext,
      hasPrevios: hasPrevious,
      items: this.mapper.mapArray(
        printerEvents,
        PrinterEvent,
        PrinterEventResponseDto,
      ),
      total,
      page: options.page,
      pageSize: options.size,
      totalPages,
    } as AppPaginatedResponseDto<PrinterEventResponseDto>;
  }
}
