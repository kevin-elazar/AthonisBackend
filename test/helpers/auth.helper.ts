import { INestApplication } from '@nestjs/common';
import request from 'supertest';

export async function getAuthToken(
  app: INestApplication,
  credentials: { email: string; password: string } = {
    email: 'admin@athonis.com',
    password: 'admin123',
  },
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .send(credentials);

  return response.body.access_token;
}
