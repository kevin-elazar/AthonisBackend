import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Order } from '../src/shared/entities/order.entity';
import { Vehicle } from '../src/shared/entities/vehicle.entity';
import { createTestApp } from './helpers/app.helper';
import { getAuthToken } from './helpers/auth.helper';
import { seedDriver, TEST_COMPANY } from './seed/driver-route.seed';
import { seedTestUser } from './seed/test-data.seed';

/**
 * A planilha modelo baixada pelo painel é importada sem nenhum ajuste: é o
 * roteiro da demonstração (baixar → importar → gerar rotas).
 */
describe('Importação de pedidos (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await seedTestUser(dataSource);
    await seedDriver(dataSource, 'Carla Modelo');
    await seedDriver(dataSource, 'Diego Modelo');
    const vehicles = dataSource.getRepository(Vehicle);
    await vehicles.save([
      vehicles.create({ id_company: TEST_COMPANY, name: 'Van Modelo 1' }),
      vehicles.create({ id_company: TEST_COMPANY, name: 'Van Modelo 2' }),
    ]);
    token = await getAuthToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('o modelo baixado importa os 10 pedidos com motorista e veículo da empresa', async () => {
    const modelo = await http()
      .get('/order-imports/template')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, done) => {
        let corpo = '';
        res.setEncoding('utf8');
        res.on('data', (parte: string) => (corpo += parte));
        res.on('end', () => done(null, corpo));
      })
      .expect(200);

    expect(modelo.headers['content-type']).toContain('text/csv');
    expect(modelo.headers['content-disposition']).toContain('modelo-importacao-pedidos.csv');
    const csv = modelo.body as string;
    expect(csv).toContain('Jaraguá do Sul');

    const importacao = await http()
      .post('/order-imports/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(csv, 'utf8'), 'modelo-importacao-pedidos.csv')
      .expect(201);

    expect(importacao.body.quantidadeFalhas).toBe(0);
    expect(importacao.body.quantidadeSucessos).toBe(10);

    const ids = importacao.body.sucessos.map((s: { order_id: number }) => s.order_id);
    const pedidos = await dataSource.getRepository(Order).findByIds(ids);
    expect(pedidos).toHaveLength(10);
    for (const pedido of pedidos) {
      expect(pedido.id_company).toBe(TEST_COMPANY);
      expect(pedido.driver_id).toEqual(expect.any(Number));
      expect(pedido.vehicle_id).toEqual(expect.any(Number));
      expect(pedido.delivery_city).toBe('Jaraguá do Sul');
    }
    // Dois pares de motorista e veículo: duas rotas na demonstração.
    expect(new Set(pedidos.map((p) => p.driver_id)).size).toBe(2);
  });

  it('modelo sem login é recusado', async () => {
    await http().get('/order-imports/template').expect(401);
  });
});
