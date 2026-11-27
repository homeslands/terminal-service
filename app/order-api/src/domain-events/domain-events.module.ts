import { Module } from '@nestjs/common';
import { SharedClientsModule } from 'src/shared/clients/shared-clients.module';
import { OrderEventPublisher } from './order-event.publisher';
import { UserCreatedConsumer } from './user-created.consumer';

// Buoc 9.3 - domain event that qua RabbitMQ: phat `order.completed` vao
// `shared_user_queue`, nghe `user.created` o `terminal_queue`.
@Module({
  imports: [SharedClientsModule],
  controllers: [UserCreatedConsumer],
  providers: [OrderEventPublisher],
  exports: [OrderEventPublisher],
})
export class DomainEventsModule {}
