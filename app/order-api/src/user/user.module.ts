import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { User } from './user.entity';
import { UserProfile } from './user.mapper';
import { MailModule } from 'src/mail/mail.module';
import { UserScheduler } from './user.scheduler';
import { Role } from 'src/role/role.entity';
import { Branch } from 'src/branch/branch.entity';
import { UserUtils } from './user.utils';
import { UserRequirement } from './user-requirement.entity';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { SharedUserServiceModule } from 'src/external-services/shared-user-service/shared-user-service.module';
import { UserProvisioningModule } from './user-provisioning.module';
import { QueueRegisterKey } from 'src/app/app.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role, Branch, UserRequirement]),
    MailModule,
    SharedUserServiceModule,
    // QD19 - ca bon lop dung CHUNG mot `ensureLocalUser`.
    UserProvisioningModule,
    // Redis cua Redlock: lop 1 dung lam throttle (`SET NX EX`), lop 3 dung
    // lam khoa phan tan cho hai luoi cron.
    BullModule.registerQueue({ name: QueueRegisterKey.DISTRIBUTE_LOCK_JOB }),
  ],
  controllers: [UserController],
  providers: [
    UserService,
    UserProfile,
    UserScheduler,
    UserUtils,
    TransactionManagerService,
  ],
  exports: [UserService, UserUtils],
})
export class UserModule {}
