import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'SHARED_USER_RMQ',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
          queue: 'shared_user_queue',
          queueOptions: { durable: true },
          // Buoc 9.2: `durable` giu QUEUE qua restart cua broker, `persistent`
          // giu THONG DIEP. Doi cung luc voi consumer cua queue nay.
          persistent: true,
        },
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class SharedClientsModule {}
