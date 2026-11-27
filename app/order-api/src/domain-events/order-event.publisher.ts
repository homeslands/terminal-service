import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { randomUUID } from 'crypto';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { TimeoutError, timeout } from 'rxjs';
import { Order } from 'src/order/order.entity';
import { SERVICE_PREFIX } from 'src/shared/constants/service-ref.constant';

/**
 * Buoc 9.3 - domain event `order.completed` (architect-http.md muc 6.2): bao
 * cho `shared-user` (va service khac ve sau) biet don da CHOT XONG, de chay
 * side-effect KHONG bat buoc (log phan tich, thong bao, campaign...).
 *
 * LUONG TIEN KHONG DI QUA BROKER (muc 6.3): tru xu, xac nhan diem, cong diem
 * da chay xong bang HTTP noi bo kem khoa idempotent TRUOC khi event nay duoc
 * phat. Event chi la thong bao sau khi viec da xong - ben nhan KHONG duoc dung
 * no de cong / tru gi.
 *
 * Giao nhan: khong co outbox. Broker chet luc chot don => event mat (log
 * warn), don van chot. Ben nhan phai chiu duoc ca thieu lan trung (`eventId`
 * de khu trung).
 */
export const ORDER_COMPLETED_EVENT = 'order.completed';

export const DOMAIN_EVENT_PUBLISH_TIMEOUT_MS = 5000;

// Loi `connectFailed` cua amqp-connection-manager la `{ err, url }`, khong
// phai `Error` => doc ca `err.message`, khong thi log ra "undefined".
function describePublishError(error: unknown): string {
  const e = error as { message?: string; err?: { message?: string } } | null;
  return e?.message ?? e?.err?.message ?? String(error);
}

export interface OrderCompletedEvent {
  eventId: string;
  occurredAt: string;
  service: string;
  orderSlug: string;
  referenceNumber: number | null;
  branchSlug: string | null;
  sharedUserId: string | null;
  paymentMethod: string | null;
  subtotal: number;
}

@Injectable()
export class OrderEventPublisher {
  constructor(
    @Inject('SHARED_USER_RMQ') private readonly client: ClientProxy,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
  ) {}

  /**
   * Ban-va-quen: tra ve ngay, KHONG BAO GIO nem, khong cho broker - duong chot
   * don khong duoc cham hay hong vi RabbitMQ.
   */
  publishOrderCompleted(order: Order): void {
    const context = `${OrderEventPublisher.name}.${this.publishOrderCompleted.name}`;
    let eventId: string | null = null;
    try {
      const event: OrderCompletedEvent = {
        eventId: randomUUID(),
        occurredAt: new Date().toISOString(),
        service: SERVICE_PREFIX,
        orderSlug: order.slug,
        referenceNumber: order.referenceNumber ?? null,
        branchSlug: order.branch?.slug ?? null,
        sharedUserId: order.owner?.sharedUserId ?? null,
        paymentMethod: order.payment?.paymentMethod ?? null,
        subtotal: Number(order.subtotal),
      };
      eventId = event.eventId;
      // `emit` cua Nest 10 la observable NONG: message di ngay ca khi khong ai
      // subscribe. Subscribe chi de biet ket qua va bat loi.
      this.client
        .emit(ORDER_COMPLETED_EVENT, event)
        .pipe(timeout(DOMAIN_EVENT_PUBLISH_TIMEOUT_MS))
        .subscribe({
          complete: () =>
            this.logger.log(
              `[${ORDER_COMPLETED_EVENT}] published order ${order.slug} (event ${event.eventId})`,
              context,
            ),
          error: (error) =>
            this.onPublishError(error, order.slug, event.eventId, context),
        });
    } catch (error) {
      this.onPublishError(error, order?.slug, eventId, context);
    }
  }

  private onPublishError(
    error: unknown,
    orderSlug: string,
    eventId: string | null,
    context: string,
  ): void {
    if (error instanceof TimeoutError) {
      // Broker rot SAU khi da noi: amqp-connection-manager giu message trong
      // bo dem va gui khi noi lai, nen event co the toi muon. KHONG dong client
      // (dong la vut bo dem).
      this.logger.warn(
        `[${ORDER_COMPLETED_EVENT}] publish of order ${orderSlug} (event ${eventId}) not confirmed within ${DOMAIN_EVENT_PUBLISH_TIMEOUT_MS} ms - RabbitMQ unreachable, the event may arrive late or be lost. The order itself is finalized.`,
        context,
      );
      return;
    }
    // Loi that, vd broker chet ngay lan noi DAU TIEN: `ClientRMQ` cua Nest 10
    // giu loi do trong `connection$` mai mai => moi lan emit sau deu hong toi
    // khi khoi dong lai service. Dong client de lan publish sau noi lai tu dau.
    try {
      this.client.close();
    } catch {
      // da dong / chua tung noi - khong co gi de lam
    }
    this.logger.warn(
      `[${ORDER_COMPLETED_EVENT}] publish of order ${orderSlug} (event ${eventId}) failed: ${describePublishError(error)} - event dropped. The order itself is finalized.`,
      context,
    );
  }
}
