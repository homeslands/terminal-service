import { Inject, Injectable, Logger } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { MembershipCard } from './membership-card.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { CHECK_MEMBERSHIP_CARD_EXPIRED_JOB } from './membership-card.constants';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import _ from 'lodash';

@Injectable()
export class MembershipCardScheduler {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    @InjectRepository(MembershipCard)
    private readonly membershipCardRepository: Repository<MembershipCard>,
    private readonly transactionManagerService: TransactionManagerService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM, {
    name: CHECK_MEMBERSHIP_CARD_EXPIRED_JOB,
  })
  async checkMembershipCardExpired() {
    const context = `${MembershipCardScheduler.name}.${this.checkMembershipCardExpired.name}`;
    this.logger.log(`Checking membership card expired`, context);
    const membershipCards = await this.membershipCardRepository.find({
      where: {
        expiredAt: LessThanOrEqual(new Date()),
        isActive: true,
      },
    });
    if (_.isEmpty(membershipCards)) return;
    this.logger.log(
      `Membership cards expired: ${membershipCards.length}`,
      context,
    );
    membershipCards.forEach((membershipCard) => {
      membershipCard.isActive = false;
    });
    await this.transactionManagerService.execute<void>(
      async (manager) => {
        await manager.save(membershipCards);
      },
      () => {
        this.logger.log(
          `Membership cards expired: ${membershipCards.length}`,
          context,
        );
      },
      (error) => {
        this.logger.error(
          `Error when checking membership card expired: ${error.message}`,
          error.stack,
          context,
        );
      },
    );
  }
}
