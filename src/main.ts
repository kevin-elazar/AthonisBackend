import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { AppModule } from './app.module';
import { loggingConfig } from './config/logging.config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { HttpErrorInterceptor } from './shared/interceptors/http-error.interceptor';
import { HttpExceptionFilter } from './filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'debug', 'log', 'verbose'],
  });

  app.useGlobalInterceptors(new HttpErrorInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  // Configuração do Swagger
  const config = new DocumentBuilder()
    .setTitle('Logistics API')
    .setDescription('API para sistema de logística')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      enableDebugMessages: true,
      exceptionFactory: (errors) => {
        const formattedErrors = errors.map(err => ({
          field: err.property,
          messages: Object.values(err.constraints || {})
        }));
        
        throw new BadRequestException({
          message: 'Falha na validação dos dados',
          errors: formattedErrors
        });
      }
    })
  );
  app.enableCors();

  await app.listen(3000);
}
bootstrap();