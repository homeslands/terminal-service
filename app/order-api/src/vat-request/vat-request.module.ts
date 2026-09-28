import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VatRequest } from './vat-request.entity';
import { VatRequestService } from './vat-request.service';
import { VatRequestController } from './vat-request.controller';
import { Invoice } from 'src/invoice/invoice.entity';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports: [TypeOrmModule.forFeature([VatRequest, Invoice]), MailModule],
  controllers: [VatRequestController],
  providers: [VatRequestService],
  exports: [VatRequestService],
})
export class VatRequestModule {}
