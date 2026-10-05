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
import { SharedUserServiceModule } from 'src/external-services/shared-user-service/shared-user-service.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TableBookingEntity, User]),
    DbModule,
    NotificationModule,
    MailModule,
    // Doc email that cua nhan vien tu shared-user truoc khi gui mail dat ban
    // - xem chu thich o `sendMailAfterTableBookingIsCreated`.
    SharedUserServiceModule,
  ],
  controllers: [TableBookingController],
  providers: [TableBookingService, TableBookingProfile],
})
export class TableBookingModule {}
