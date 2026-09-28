import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TableBookingController } from './table-booking.controller';
import { TableBookingService } from './table-booking.service';
import { TableBookingEntity } from './table-booking.entity';
import { TableBookingProfile } from './table-booking.mapper';
import { DbModule } from 'src/db/db.module';
import { NotificationModule } from 'src/notification/notification.module';
import { MailModule } from 'src/mail/mail.module';
import { User } from 'src/user/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([TableBookingEntity, User]),
    DbModule,
    NotificationModule,
    MailModule,
  ],
  controllers: [TableBookingController],
  providers: [TableBookingService, TableBookingProfile],
})
export class TableBookingModule {}
