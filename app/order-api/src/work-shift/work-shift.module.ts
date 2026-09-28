import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkShift } from './work-shift.entity';
import { WorkShiftService } from './work-shift.service';
import { WorkShiftController } from './work-shift.controller';
import { Order } from 'src/order/order.entity';
import { Invoice } from 'src/invoice/invoice.entity';
import { User } from 'src/user/user.entity';
import { Branch } from 'src/branch/branch.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkShift, Order, Invoice, User, Branch]),
  ],
  controllers: [WorkShiftController],
  providers: [WorkShiftService],
  exports: [WorkShiftService],
})
export class WorkShiftModule {}
