import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueRegisterKey } from 'src/app/app.constants';
import { AccumulatedPointModule } from 'src/accumulated-point/accumulated-point.module';
import { WalletReconcileScheduler } from './wallet-reconcile.scheduler';

// Buoc 9.1 - job doi soat vi/diem hai chieu (Z-8).
@Module({
  imports: [
    AccumulatedPointModule,
    BullModule.registerQueue({
      name: QueueRegisterKey.DISTRIBUTE_LOCK_JOB,
    }),
  ],
  providers: [WalletReconcileScheduler],
})
export class WalletReconcileModule {}
