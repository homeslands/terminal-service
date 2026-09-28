import { Inject, Injectable, Logger } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { randomBytes, createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';

import { SharedRedisService } from 'src/shared/redis/shared-redis.service';
import { UserUtils } from 'src/user/user.utils';

import { Order } from 'src/order/order.entity';
import { User } from 'src/user/user.entity';

import { GenerateQrPaymentResponseDto } from './qr-payment.dto';
import { QrPaymentException } from './qr-payment.exception';
import { QrPaymentValidation } from './qr-payment.validation';
import { CurrentUserDto } from 'src/user/user.dto';

@Injectable()
export class QrPaymentService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    private readonly sharedRedisService: SharedRedisService,
    private readonly userUtils: UserUtils,
    private readonly configService: ConfigService,
  ) {}

  async generate(
    currentUser: CurrentUserDto,
  ): Promise<GenerateQrPaymentResponseDto> {
    const context = `${QrPaymentService.name}.${this.generate.name}`;

    const user = await this.userUtils.getUser({
      where: { id: currentUser.userId ?? IsNull() },
    });
    const userSlug = user.slug;

    // Generate token
    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = createHash('sha256').update(rawToken).digest('hex');

    // Invalidate old QR if exists
    const oldHash = await this.sharedRedisService.get(
      `terminal:qr:active:${userSlug}`,
    );
    if (oldHash) {
      await this.sharedRedisService.del(`terminal:qr:token:${oldHash}`);
    }

    const qrTokenTtl = this.configService.get<number>('QR_TOKEN_TTL');
    const qrActiveTtl = this.configService.get<number>('QR_ACTIVE_TTL');

    // Store new token
    await this.sharedRedisService.set(
      `terminal:qr:token:${hashedToken}`,
      userSlug,
      Number(qrTokenTtl),
    );
    await this.sharedRedisService.set(
      `terminal:qr:active:${userSlug}`,
      hashedToken,
      Number(qrActiveTtl),
    );

    const expiresAt = new Date(
      Date.now() + Number(qrTokenTtl) * 1000,
    ).toISOString();

    this.logger.log(`QR token generated for user ${userSlug}`, context);

    return { token: rawToken, expiresAt };
  }

  /**
   * Internal helper called by PaymentService.initiate when dto.qrToken is set.
   * Performs ONLY QR-specific authentication. Does NOT repeat checks already
   * done by initiate (order existence, status, payment, voucher, …) or
   * pointStrategy.process (balance).
   *
   * Steps:
   *  1. Hash token + lookup Redis qr:token:{hash}        → QR_TOKEN_INVALID
   *  2. Atomic DEL the token (one-time use)              → QR_TOKEN_ALREADY_USED
   *  3. Check idempotency key qr:idempotent:{order}:{h}  → QR_TOKEN_ALREADY_USED
   *  4. Resolve customer from userSlug stored in Redis
   *  5. Validate order.owner === customer                → QR_OWNER_MISMATCH
   *  6. Validate staff branch === order branch           → FORBIDDEN_BRANCH
   *
   * @returns the customer (User) resolved from the QR token
   */
  async verify(
    token: string,
    order: Order,
    currentUser: CurrentUserDto,
  ): Promise<User> {
    const context = `${QrPaymentService.name}.${this.verify.name}`;

    // 1. Hash token and lookup
    const hashedToken = createHash('sha256').update(token).digest('hex');

    const userSlug = await this.sharedRedisService.get(
      `terminal:qr:token:${hashedToken}`,
    );
    if (!userSlug) {
      this.logger.warn(`QR token invalid or expired`, context);
      throw new QrPaymentException(QrPaymentValidation.QR_TOKEN_INVALID);
    }

    // 2. Atomic delete (one-time use)
    const deleted = await this.sharedRedisService.del(
      `terminal:qr:token:${hashedToken}`,
    );
    if (deleted === 0) {
      this.logger.warn(`QR token already used`, context);
      throw new QrPaymentException(QrPaymentValidation.QR_TOKEN_ALREADY_USED);
    }

    // 3. Idempotency check (defensive — DEL above already guards races)
    const idempotentKey = `terminal:qr:idempotent:${order.slug}:${hashedToken}`;
    const existing = await this.sharedRedisService.get(idempotentKey);
    if (existing) {
      this.logger.warn(
        `Duplicate QR payment attempt for order ${order.slug}`,
        context,
      );
      throw new QrPaymentException(QrPaymentValidation.QR_TOKEN_ALREADY_USED);
    }

    // 4. Resolve customer
    const customer = await this.userUtils.getUser({
      where: { slug: userSlug ?? IsNull() },
    });

    // 5. Validate QR owner matches order owner
    if (order.owner?.slug !== customer.slug) {
      this.logger.warn(
        `QR owner ${customer.slug} does not match order owner ${order.owner?.slug}`,
        context,
      );
      throw new QrPaymentException(QrPaymentValidation.QR_OWNER_MISMATCH);
    }

    // 6. Validate staff belongs to order branch
    const staff = await this.userUtils.getUser({
      where: { id: currentUser.userId ?? IsNull() },
      relations: ['branch'],
    });

    if (!staff.branch || !order.branch || staff.branch.id !== order.branch.id) {
      this.logger.warn(
        `Staff ${staff.slug} not in order branch ${order.branch?.slug}`,
        context,
      );
      throw new QrPaymentException(QrPaymentValidation.FORBIDDEN_BRANCH);
    }

    return customer;
  }

  /**
   * Internal helper called by PaymentService.initiate after PAYMENT_PAID is
   * emitted. Sets the QR idempotency key. Must NEVER touch balance — that is
   * JobService's responsibility via the PAYMENT_PAID listener. Customer
   * notification is handled by NotificationUtils.sendNotificationAfterOrderIsPaid.
   */
  async finalize(token: string, order: Order, customer: User): Promise<void> {
    const context = `${QrPaymentService.name}.${this.finalize.name}`;

    const hashedToken = createHash('sha256').update(token).digest('hex');

    const qrIdempotentTtl = this.configService.get<number>('QR_IDEMPOTENT_TTL');

    // Set idempotency key
    await this.sharedRedisService.set(
      `terminal:qr:idempotent:${order.slug}:${hashedToken}`,
      '1',
      Number(qrIdempotentTtl),
    );

    this.logger.log(
      `QR payment finalized: order=${order.slug}, amount=${order.subtotal}, customer=${customer.slug}`,
      context,
    );
  }
}
