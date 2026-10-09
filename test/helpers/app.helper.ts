import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { HttpErrorInterceptor } from '../../src/shared/interceptors/http-error.interceptor';
import { HttpExceptionFilter } from '../../src/filters/http-exception.filter';

/** Sobe a aplicação com os mesmos pipes, filtros e interceptors do main.ts. */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  app.useGlobalInterceptors(new HttpErrorInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        new BadRequestException({
          message: 'Falha na validação dos dados',
          errors: errors.map((err) => ({
            field: err.property,
            messages: Object.values(err.constraints || {}),
          })),
        }),
    }),
  );

  await app.init();
  return app;
}
