import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Role } from 'src/role/role.entity';
import { UserProvisioningService } from './user-provisioning.service';

// Module RIENG, co y toi thieu: chi hai repository, khong import module nao
// khac. Ly do la de bon lop cua QD19 - JwtStrategy (auth), UserService +
// UserScheduler (user), va cac diem ghi o order/the thanh vien - deu dung
// CHUNG mot `ensureLocalUser` ma khong ai phai keo theo ca UserModule, va
// khong tao vong import.
@Module({
  imports: [TypeOrmModule.forFeature([User, Role])],
  providers: [UserProvisioningService],
  exports: [UserProvisioningService],
})
export class UserProvisioningModule {}
