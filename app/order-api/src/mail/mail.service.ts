import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { resolve } from 'path';
import { User } from 'src/user/user.entity';
import { MailProducer } from './mail.producer';
@Injectable()
export class MailService {
  constructor(
    private readonly mailProducer: MailProducer,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
  ) {}

  async sendForgotPasswordToken(user: User, code: string, expiresAt: string) {
    const context = `${MailService.name}.${this.sendForgotPasswordToken.name}`;
    await this.mailProducer.sendMail({
      to: user.email, // list of receivers
      subject: '[The Terminal] Reset Password', // Subject line
      template: resolve('public/templates/mail/forgot-password'), // `.ejs` extension is appended automatically
      context: {
        name: `${user.firstName} ${user.lastName}`,
        code,
        expiresAt,
      },
    });
    this.logger.log(`Email is sending to ${user.email}`, context);
  }

  async sendNewPassword(user: User, newPassword: string) {
    const context = `${MailService.name}.${this.sendNewPassword.name}`;
    try {
      await this.mailProducer.sendMail({
        to: user.email, // list of receivers
        // from: '"Support Team" <support@example.com>', // override default from
        subject: '[The Terminal] Reset Password', // Subject line
        template: resolve('public/templates/mail/reset-password'), // `.ejs` extension is appended automatically
        context: {
          name: `${user.firstName} ${user.lastName}`,
          newPassword,
        },
      });
    } catch (error) {
      this.logger.error(
        `Error sending email to ${JSON.stringify(error)}`,
        error.stack,
        context,
      );
      throw new BadRequestException(`Error sending email to ${user.email}`);
    }
    this.logger.log(`Email sent to ${user.email}`, context);
  }

  async sendVerifyEmail(
    user: User,
    code: string,
    email: string,
    expiresAt: string,
  ) {
    const context = `${MailService.name}.${this.sendVerifyEmail.name}`;
    await this.mailProducer.sendMail({
      to: email,
      subject: '[The Terminal] Verify Email',
      template: resolve('public/templates/mail/verify-email'),
      context: {
        name: `${user.firstName} ${user.lastName}`,
        code,
        expiresAt,
      },
    });
    this.logger.log(`Email is sending to ${email}`, context);
  }

  async sendVatRequestConfirmation(
    email: string,
    invoiceSlug: string,
    referenceNumber: number,
    data: {
      customerName: string;
      taxCode: string;
      address: string;
      email: string;
      companyName?: string;
    },
  ) {
    const context = `${MailService.name}.${this.sendVatRequestConfirmation.name}`;
    await this.mailProducer.sendMail({
      to: email,
      subject: '[The Terminal] Xác nhận yêu cầu xuất hóa đơn VAT',
      template: resolve('public/templates/mail/vat-request-confirmation'),
      context: {
        invoiceSlug,
        referenceNumber,
        ...data,
      },
    });
    this.logger.log(`VAT request confirmation sent to ${email}`, context);
  }

  async sendInvoiceWhenOrderPaid(user: User, invoice: Buffer) {
    const context = `${MailService.name}.${this.sendInvoiceWhenOrderPaid.name}`;

    if (user.email && user.isVerifiedEmail) {
      await this.mailProducer.sendMail({
        to: user.email,
        subject: '[The Terminal] Invoice',
        template: resolve('public/templates/mail/send-invoice'),
        context: {
          name: `${user.firstName} ${user.lastName}`,
        },
        attachments: [
          {
            filename: 'invoice.pdf',
            content: invoice.toString('base64'),
            encoding: 'base64',
            contentType: 'application/pdf',
          },
        ],
      });
      this.logger.log(`Invoice is sending to ${user.email}`, context);
    }
  }

  async sendTableBookingCreated(
    toEmails: string[],
    data: {
      customerName: string;
      phone: string;
      email?: string | null;
      bookingTime: string;
      seats?: number | null;
      note?: string | null;
    },
  ) {
    const context = `${MailService.name}.${this.sendTableBookingCreated.name}`;
    if (toEmails.length === 0) return;

    await this.mailProducer.sendMail({
      to: toEmails,
      subject: '[The Terminal] Thông báo đặt bàn mới',
      template: resolve('public/templates/mail/table-booking-created'),
      context: data,
    });
    this.logger.log(
      `Table booking created email sent to ${toEmails.join(', ')}`,
      context,
    );
  }
}
