import { config as dotenvConfig } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { HttpErrorInterceptor } from './shared/interceptors/http-error.interceptor';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { config as envConfig } from './config/env.config';

// Carregar variáveis de ambiente do arquivo .env
dotenvConfig();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'debug', 'log', 'verbose'],
  });

  app.useGlobalInterceptors(new HttpErrorInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  // Configuração do Swagger
  const config = new DocumentBuilder()
    .setTitle('Logistics API')
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
      'JWT-auth', // Este nome será usado no @ApiBearerAuth()
    )
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

  await app.listen(envConfig.port);
}
bootstrap();