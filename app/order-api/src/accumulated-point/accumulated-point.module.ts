import { Module } from '@nestjs/common';
import { SharedUserServiceModule } from 'src/external-services/shared-user-service/shared-user-service.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccumulatedPoint } from './entities/accumulated-point.entity';
import { AccumulatedPointTransactionHistory } from './entities/accumulated-point-transaction-history.entity';
import { AccumulatedPointService } from './accumulated-point.service';
import { AccumulatedPointController } from './accumulated-point.controller';
import { AccumulatedPointProfile } from './accumulated-point.mapper';
import { User } from 'src/user/user.entity';
import { Order } from 'src/order/order.entity';

@Module({
  imports: [
    // Buoc 7.7d: AccumulatedPointService goi shared-user (diem tich luy).
    SharedUserServiceModule,
    TypeOrmModule.forFeature([
      AccumulatedPoint,
      AccumulatedPointTransactionHistory,
      User,
      Order,
    ]),
  ],
  controllers: [AccumulatedPointController],
  providers: [AccumulatedPointService, AccumulatedPointProfile],
  exports: [AccumulatedPointService],
})
export class AccumulatedPointModule {}
