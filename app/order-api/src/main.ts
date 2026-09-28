import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { corsOptions } from './config/cors.config';
import { NestExpressApplication } from '@nestjs/platform-express';
// import { otelSDK } from './otel';
import { sessionConfig } from './config/session.config';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // otelSDK.start();
  // rawBody: true - can thiet de InternalApiGuard tinh lai chu ky HMAC tu
  // dung rawBody, tranh sai lech do JSON re-serialize khac thu tu field.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get('PORT') || 8088;
  const version = configService.get('VERSION');
  const allowedOrigins = configService.get('ALLOWED_ORIGINS');

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
      queue: 'terminal_queue',
      queueOptions: { durable: false },
    },
  });

  // Toan bo route, ke ca /internal/* deu mang tien to api/${version} -
  // client wrapper trong external-services/ tu ghep version vao path truoc
  // khi ky HMAC de khop voi path server that su nhan duoc.
  app.setGlobalPrefix(`api/${version}`);
  app.enableCors(corsOptions(allowedOrigins));
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Order API')
    .setDescription('The Order API documentation')
    .setVersion('v1.0.0')
    .addBearerAuth()
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/api-docs', app, documentFactory, {
    // jsonDocumentUrl: 'api/swagger/json',
    jsonDocumentUrl: 'swagger.json',
  });

  const trustProxyCount = configService.get<number>('TRUST_PROXY_COUNT');
  app.set('trust proxy', trustProxyCount);

  app.use(sessionConfig);

  await app.startAllMicroservices();

  logger.log(`Server running on port ${port}`);
  logger.log(`Swagger running at http://localhost:${port}/api/api-docs`);
  await app.listen(port);
}
bootstrap();
