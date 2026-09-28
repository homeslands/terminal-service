import { Module } from '@nestjs/common';
import { MembershipCardService } from './membership-card.service';
import { MembershipCardController } from './membership-card.controller';
import { MembershipCard } from './membership-card.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipCardProfile } from './membership-card.mapper';
import { User } from 'src/user/user.entity';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { MembershipCardScheduler } from './membership-card.scheduler';
import { Role } from 'src/role/role.entity';
import { UserGroup } from 'src/user-group/user-group.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MembershipCard, User, Role, UserGroup])],
  controllers: [MembershipCardController],
  providers: [
    MembershipCardService,
    MembershipCardProfile,
    MembershipCardScheduler,
    TransactionManagerService,
  ],
})
export class MembershipCardModule {}
