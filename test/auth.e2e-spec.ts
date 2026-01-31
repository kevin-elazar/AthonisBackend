import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, BadRequestException } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpErrorInterceptor } from '../src/shared/interceptors/http-error.interceptor';
import { HttpExceptionFilter } from '../src/filters/http-exception.filter';
import { DataSource } from 'typeorm';
import { seedTestUser } from './seed/test-data.seed';
import { loginDto, invalidLoginDto } from './fixtures/auth.fixtures';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalInterceptors(new HttpErrorInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: (errors) => {
          const formattedErrors = errors.map((err) => ({
            field: err.property,
            messages: Object.values(err.constraints || {}),
          }));
          return new BadRequestException({
            message: 'Falha na validação dos dados',
            errors: formattedErrors,
          });
        },
      }),
    );

    await app.init();

    const dataSource = app.get(DataSource);
    await seedTestUser(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('deve retornar 200 e access_token com credenciais válidas', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('access_token');
          expect(res.body).toHaveProperty('token_type', 'Bearer');
          expect(res.body).toHaveProperty('user');
          expect(res.body.user).toHaveProperty('email', loginDto.email);
        });
    });

    it('deve retornar 401 com credenciais inválidas', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send(invalidLoginDto)
        .expect(401);
    });
  });

  describe('GET /auth/profile', () => {
    it('deve retornar 401 sem token', () => {
      return request(app.getHttpServer())
        .get('/auth/profile')
        .expect(401);
    });

    it('deve retornar 200 com token válido', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto);

      const token = loginResponse.body.access_token;

      return request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('email', loginDto.email);
          expect(res.body).toHaveProperty('name');
          expect(res.body).not.toHaveProperty('password');
        });
    });
  });
});
