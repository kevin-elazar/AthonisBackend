import { rawQuery } from './helpers/db.helper';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { createTestApp } from './helpers/app.helper';
import { getAuthToken } from './helpers/auth.helper';
import { seedTestUser } from './seed/test-data.seed';
import { seedDriver, seedRoute } from './seed/driver-route.seed';
import { Route } from '../src/shared/entities/route.entity';
import { Order } from '../src/shared/entities/order.entity';

/**
 * O aplicativo do entregador entra com um login comum. O que estes testes
 * protegem é o isolamento: o token do motorista só pode enxergar as próprias
 * rotas, e nada do que o escritório vê.
 */
describe('Aplicativo do entregador (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;

  const ana = { email: 'ana@athonis.com', password: 'senha-ana' };
  const bruno = { email: 'bruno@athonis.com', password: 'senha-bruno' };
  let anaDriverId: number;
  let brunoDriverId: number;
  let rotaDaAna: Route;
  let pedidosDaAna: Order[];
  let rotaDoBruno: Route;

  const http = () => request(app.getHttpServer());
  const evento = (extra: Record<string, unknown> = {}) => ({
    client_event_id: randomUUID(),
    occurred_at: new Date().toISOString(),
    ...extra,
  });

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await seedTestUser(dataSource);
    adminToken = await getAuthToken(app);

    anaDriverId = (await seedDriver(dataSource, 'Ana Motorista')).driver_id;
    brunoDriverId = (await seedDriver(dataSource, 'Bruno Motorista')).driver_id;

    ({ route: rotaDaAna, orders: pedidosDaAna } = await seedRoute(dataSource, anaDriverId));
    ({ route: rotaDoBruno } = await seedRoute(dataSource, brunoDriverId));

    await http()
      .put(`/drivers/${anaDriverId}/access`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(ana)
      .expect(200);
    await http()
      .put(`/drivers/${brunoDriverId}/access`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(bruno)
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('acesso do motorista', () => {
    it('o login traz o papel driver, o motorista vinculado e um refresh token', async () => {
      const res = await http().post('/auth/login').send(ana).expect(200);

      expect(res.body.user).toMatchObject({ role: 'driver', driver_id: anaDriverId });
      expect(res.body.refresh_token).toEqual(expect.any(String));
    });

    it('só o admin administra o acesso', async () => {
      const token = await getAuthToken(app, ana);

      await http()
        .put(`/drivers/${brunoDriverId}/access`)
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'x@athonis.com', password: 'qualquer1' })
        .expect(403);
    });

    it('recusa um e-mail que já pertence a outro usuário', async () => {
      await http()
        .put(`/drivers/${brunoDriverId}/access`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: ana.email, password: 'qualquer1' })
        .expect(409);
    });

    it('o cadastro comum de usuário não cria o papel driver', async () => {
      await http()
        .post('/auth/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'falso@athonis.com', password: 'senha123', name: 'Falso', role: 'driver' })
        .expect(400);
    });
  });

  describe('isolamento', () => {
    let tokenAna: string;

    beforeAll(async () => {
      tokenAna = await getAuthToken(app, ana);
    });

    it('lista apenas as rotas do próprio motorista', async () => {
      const res = await http()
        .get('/driver/routes')
        .set('Authorization', `Bearer ${tokenAna}`)
        .expect(200);

      expect(res.body.map((route: { route_id: number }) => route.route_id)).toEqual([
        rotaDaAna.route_id,
      ]);
      expect(res.body[0].stops.map((stop: { order_id: number }) => stop.order_id)).toEqual(
        pedidosDaAna.map((order) => order.order_id),
      );
    });

    it('responde 404 para a rota de outro motorista', async () => {
      await http()
        .get(`/driver/routes/${rotaDoBruno.route_id}`)
        .set('Authorization', `Bearer ${tokenAna}`)
        .expect(404);

      await http()
        .post(`/driver/routes/${rotaDoBruno.route_id}/start`)
        .set('Authorization', `Bearer ${tokenAna}`)
        .send(evento())
        .expect(404);
    });

    it.each([
      ['GET', '/orders'],
      ['GET', '/routes'],
      ['GET', '/clients'],
      ['GET', '/drivers'],
      ['GET', '/vehicles'],
      ['GET', '/company'],
      ['GET', '/optimized-routes-history'],
    ])('o token do motorista recebe 403 em %s %s', async (_method, path) => {
      await http().get(path).set('Authorization', `Bearer ${tokenAna}`).expect(403);
    });

    it('o escritório não entra na API do aplicativo', async () => {
      await http().get('/driver/routes').set('Authorization', `Bearer ${adminToken}`).expect(403);
    });

    it('sem token responde 401', async () => {
      await http().get('/driver/routes').expect(401);
    });
  });

  describe('saída para a rota', () => {
    it('inicia a rota com a hora do aparelho e move os pedidos para "em rota"', async () => {
      const token = await getAuthToken(app, ana);
      const saida = new Date(Date.now() - 20 * 60_000).toISOString();

      const res = await http()
        .post(`/driver/routes/${rotaDaAna.route_id}/start`)
        .set('Authorization', `Bearer ${token}`)
        .send(evento({ occurred_at: saida }))
        .expect(200);

      expect(res.body.status).toBe('active');
      expect(res.body.started_at).toBe(saida);
      expect(res.body.stops.every((stop: { status: string }) => stop.status === 'in_route')).toBe(
        true,
      );
    });

    it('reenviar o mesmo evento responde 200 e não registra de novo', async () => {
      const token = await getAuthToken(app, bruno);
      const body = evento();
      const url = `/driver/routes/${rotaDoBruno.route_id}/start`;

      await http().post(url).set('Authorization', `Bearer ${token}`).send(body).expect(200);
      await http().post(url).set('Authorization', `Bearer ${token}`).send(body).expect(200);

      const eventos = await rawQuery(dataSource, 
        'SELECT COUNT(*) AS total FROM route_event WHERE client_event_id = ?',
        [body.client_event_id],
      );
      expect(Number(eventos[0].total)).toBe(1);
    });

    it('recusa o corpo sem identificador do evento', async () => {
      const token = await getAuthToken(app, ana);

      await http()
        .post(`/driver/routes/${rotaDaAna.route_id}/start`)
        .set('Authorization', `Bearer ${token}`)
        .send({ occurred_at: new Date().toISOString() })
        .expect(400);
    });
  });

  describe('sessão', () => {
    it('renova o par de tokens e o novo access token funciona', async () => {
      const login = await http().post('/auth/login').send(ana).expect(200);

      const renovado = await http()
        .post('/auth/refresh')
        .send({ refresh_token: login.body.refresh_token })
        .expect(200);

      expect(renovado.body.refresh_token).not.toBe(login.body.refresh_token);
      await http()
        .get('/driver/me')
        .set('Authorization', `Bearer ${renovado.body.access_token}`)
        .expect(200);
    });

    it('depois do logout o refresh token não vale mais', async () => {
      const login = await http().post('/auth/login').send(ana).expect(200);

      await http()
        .post('/auth/logout')
        .send({ refresh_token: login.body.refresh_token })
        .expect(204);
      await http()
        .post('/auth/refresh')
        .send({ refresh_token: login.body.refresh_token })
        .expect(401);
    });

    it('desligar o acesso derruba a sessão e o token em uso', async () => {
      const carla = { email: 'carla@athonis.com', password: 'senha-carla' };
      const carlaId = (await seedDriver(dataSource, 'Carla Motorista')).driver_id;
      await http()
        .put(`/drivers/${carlaId}/access`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(carla)
        .expect(200);
      const login = await http().post('/auth/login').send(carla).expect(200);

      await http()
        .delete(`/drivers/${carlaId}/access`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await http()
        .get('/driver/me')
        .set('Authorization', `Bearer ${login.body.access_token}`)
        .expect(401);
      await http()
        .post('/auth/refresh')
        .send({ refresh_token: login.body.refresh_token })
        .expect(401);
      await http().post('/auth/login').send(carla).expect(401);
    });
  });
});
