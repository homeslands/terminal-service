import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkShift } from './work-shift.entity';
import { WorkShiftService } from './work-shift.service';
import { WorkShiftController } from './work-shift.controller';
import { Order } from 'src/order/order.entity';
import { Invoice } from 'src/invoice/invoice.entity';
import { User } from 'src/user/user.entity';
import { Branch } from 'src/branch/branch.entity';
import { SharedUserServiceModule } from 'src/external-services/shared-user-service/shared-user-service.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkShift, Order, Invoice, User, Branch]),
    // WorkShiftService lay ho ten + SDT thu ngan / nhan vien tu shared-user (buoc 4.6b).
    SharedUserServiceModule,
  ],
  controllers: [WorkShiftController],
  providers: [WorkShiftService],
  exports: [WorkShiftService],
})
export class WorkShiftModule {}
