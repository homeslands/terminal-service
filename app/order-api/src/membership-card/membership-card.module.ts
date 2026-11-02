import { Module } from '@nestjs/common';
import { MembershipCardService } from './membership-card.service';
import { MembershipCardController } from './membership-card.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipCardProfile } from './membership-card.mapper';
import { User } from 'src/user/user.entity';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { UserGroup } from 'src/user-group/user-group.entity';
import { SharedUserServiceModule } from 'src/external-services/shared-user-service/shared-user-service.module';
import { UserProvisioningModule } from 'src/user/user-provisioning.module';

// QD22 (buoc 2.5) - the thanh vien doi nguon sang shared-user:
// - KHONG con `TypeOrmModule.forFeature([MembershipCard])`: service khong doc
//   /ghi bang the cuc bo nua. Entity + bang VAN O LAI (doi ten o 8.9, drop o
//   10.3), chi khong con repository nao tro vao.
// - `Role` bo theo: hang cuc bo cho chu the do `UserProvisioningService` cap
//   (no tu tra role Customer), service nay khong tu dung role nua.
// - `MembershipCardScheduler` DA XOA: shared-user chay ban cua no, hai ban
//   cung quet mot bang la hai nguon ghi.
@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserGroup]),
    SharedUserServiceModule,
    // QD19 - dung CHUNG `ensureLocalUsers` voi bon lop kia; module rieng nay
    // co y toi thieu nen khong keo theo ca UserModule, khong tao vong import.
    UserProvisioningModule,
  ],
  controllers: [MembershipCardController],
  providers: [
    MembershipCardService,
    MembershipCardProfile,
    TransactionManagerService,
  ],
})
export class MembershipCardModule {}
