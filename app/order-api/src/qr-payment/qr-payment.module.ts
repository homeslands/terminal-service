import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/user/user.entity';
import { SharedModule } from 'src/shared/shared.module';
import { QrPaymentController } from './qr-payment.controller';
import { QrPaymentService } from './qr-payment.service';
import { UserUtils } from 'src/user/user.utils';

@Module({
  imports: [TypeOrmModule.forFeature([User]), SharedModule],
  controllers: [QrPaymentController],
  providers: [QrPaymentService, UserUtils],
  exports: [QrPaymentService],
})
export class QrPaymentModule {}
