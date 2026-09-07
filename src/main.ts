import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { HttpErrorInterceptor } from './shared/interceptors/http-error.interceptor';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { config, validateEnvironment } from './config/env.config';

// Falha o boot cedo se faltar configuração obrigatória (JWT_SECRET, CORS em produção).
validateEnvironment();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: config.isProduction
      ? ['error', 'warn', 'log']
      : ['error', 'warn', 'debug', 'log', 'verbose'],
  });

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.useGlobalInterceptors(new HttpErrorInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger fica disponível apenas fora de produção.
  if (!config.isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Athonis API')
      .setDescription('API para sistema de logística e otimização de rotas')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Insira o token JWT',
          in: 'header',
        },
        'JWT-auth',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api', app, document);
  }

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      enableDebugMessages: !config.isProduction,
      exceptionFactory: (errors) => {
        const formattedErrors = errors.map((err) => ({
          field: err.property,
          messages: Object.values(err.constraints || {}),
        }));

        throw new BadRequestException({
          message: 'Falha na validação dos dados',
          errors: formattedErrors,
        });
      },
    }),
  );

  // Em produção só as origens listadas em CORS_ORIGIN são aceitas
  // (validateEnvironment garante que a lista existe).
  app.enableCors({
    origin: config.cors.origins ?? true,
    credentials: true,
  });

  await app.listen(config.port);
  new Logger('Bootstrap').log(`Athonis API ouvindo na porta ${config.port}`);
}

bootstrap();
