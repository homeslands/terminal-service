import { Controller, Inject, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

/**
 * Buoc 9.3 - nghe `user.created` cua `shared-user` (architect-http.md muc
 * 6.2), queue `terminal_queue`. Hom nay chi ghi audit log, KHONG bat buoc cho
 * nghiep vu chinh: `terminal` tra user qua HTTP noi bo khi can, khong phu thuoc
 * event nay. Khong co handler thi Nest log "no matching event handler" va
 * vut message.
 */
export const USER_CREATED_EVENT = 'user.created';

export interface UserCreatedEvent {
  eventId: string;
  occurredAt: string;
  sharedUserId: string;
  role: string | null;
  via: string;
  ownerService: string | null;
}

@Controller()
export class UserCreatedConsumer {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
  ) {}

  @EventPattern(USER_CREATED_EVENT)
  handleUserCreated(@Payload() event: Partial<UserCreatedEvent>): void {
    const context = `${UserCreatedConsumer.name}.${this.handleUserCreated.name}`;
    this.logger.log(
      `[${USER_CREATED_EVENT}] received sharedUserId ${event?.sharedUserId} (role ${event?.role}, via ${event?.via}, owner ${event?.ownerService ?? 'shared'}, event ${event?.eventId})`,
      context,
    );
  }
}
