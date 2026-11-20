import { rawQuery } from './helpers/db.helper';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { createTestApp } from './helpers/app.helper';
import { getAuthToken } from './helpers/auth.helper';
import { seedTestUser } from './seed/test-data.seed';
import { seedDriver, seedRoute } from './seed/driver-route.seed';
import { Order } from '../src/shared/entities/order.entity';
import { Route } from '../src/shared/entities/route.entity';
import { Driver } from '../src/shared/entities/driver.entity';
import { UpdateQueryBuilder } from 'typeorm';
import { RouteLocationPing } from '../src/shared/entities/route-location-ping.entity';
import { RouteMetricsService } from '../src/modules/analytics/route-metrics.service';
import { RouteExecutionMetrics } from '../src/shared/entities/route-execution-metrics.entity';
import { AddressCoordinatesService } from '../src/optimization-routes/services/address-coordinates.service';

/**
 * Um dia de rota, do começo ao fim, do jeito que o aplicativo faz — inclusive
 * o que acontece quando ele fica sem sinal e reenvia tudo depois.
 */
describe('Execução da rota pelo aplicativo (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let token: string;
  let driverId: number;

  const T0 = Date.now() - 3 * 60 * 60_000;
  const em = (minutos: number) => new Date(T0 + minutos * 60_000).toISOString();

  const http = () => request(app.getHttpServer());
  const post = (path: string, body: object) =>
    http().post(path).set('Authorization', `Bearer ${token}`).send(body);
  const evento = (minutos: number, extra: Record<string, unknown> = {}) => ({
    client_event_id: randomUUID(),
    occurred_at: em(minutos),
    ...extra,
  });

  /** Uma rota nova por cenário, para um teste não depender do estado deixado por outro. */
  const novaRota = async (stops = 3, extra: Partial<Route> = {}) => {
    const { route, orders } = await seedRoute(dataSource, driverId, stops, extra);
    return { route, orders, base: `/driver/routes/${route.route_id}` };
  };

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await seedTestUser(dataSource);
    adminToken = await getAuthToken(app);

    driverId = (await seedDriver(dataSource, 'Dani Motorista')).driver_id;
    const acesso = { email: 'dani@athonis.com', password: 'senha-dani' };
    await http()
      .put(`/drivers/${driverId}/access`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(acesso)
      .expect(200);
    token = await getAuthToken(app, acesso);
  });

  afterAll(async () => {
    await app.close();
  });

  it('percorre a rota inteira: saída, chegada, entrega, ocorrência e encerramento', async () => {
    const { route, orders, base } = await novaRota();
    const [primeira, segunda, terceira] = orders.map((order) => order.order_id);

    await post(`${base}/start`, evento(0)).expect(200);

    await post(`${base}/stops/${primeira}/arrive`, evento(10, { latitude: -26.48, longitude: -49.06 })).expect(200);
    await post(`${base}/stops/${primeira}/deliver`, evento(15, { notes: 'Recebido pelo porteiro' })).expect(200);

    await post(`${base}/stops/${segunda}/arrive`, evento(30)).expect(200);
    const comOcorrencia = await post(
      `${base}/stops/${segunda}/fail`,
      evento(34, { occurrence_type: 'customer_absent', notes: 'Portão fechado' }),
    ).expect(200);

    await post(`${base}/stops/${terceira}/deliver`, evento(55)).expect(200);

    const encerrada = await post(`${base}/finish`, evento(70)).expect(200);

    expect(
      comOcorrencia.body.stops.find((s: { order_id: number }) => s.order_id === segunda),
    ).toMatchObject({
      status: 'failed',
      occurrence_type: 'customer_absent',
      notes: 'Portão fechado',
      arrived_at: em(30),
      completed_at: em(34),
    });
    expect(encerrada.body).toMatchObject({ status: 'completed', finished_at: em(70) });
    expect(encerrada.body.stops.map((s: { status: string }) => s.status)).toEqual([
      'delivered',
      'failed',
      'delivered',
    ]);

    // A hora que fica no pedido é a do aparelho, não a do recebimento.
    const pedido = await dataSource.getRepository(Order).findOneBy({ order_id: primeira });
    expect(new Date(pedido!.delivered_at!).toISOString()).toBe(em(15));

    // Encerrar libera o motorista para a escala seguinte.
    const motorista = await dataSource.getRepository(Driver).findOneBy({ driver_id: driverId });
    expect(motorista!.status).toBe('available');

    const metricas = await rawQuery(dataSource, 
      'SELECT stops_delivered, stops_failed, actual_duration_min FROM route_execution_metrics WHERE route_id = ?',
      [route.route_id],
    );
    expect(metricas[0]).toMatchObject({ stops_delivered: 2, stops_failed: 1, actual_duration_min: 70 });
  });

  describe('nova tentativa de entrega', () => {
    it('pedido não entregue vai para outra rota sem apagar a tentativa anterior', async () => {
      const admin = (method: 'get' | 'post' | 'patch', path: string) =>
        http()[method](path).set('Authorization', `Bearer ${adminToken}`);

      const { route, orders, base } = await novaRota(2);
      const [entregue, falhou] = orders.map((order) => order.order_id);
      const veiculo = await admin('post', '/vehicles')
        .send({ name: 'Van tentativas', plate: 'TNT1A23' })
        .expect(201);
      for (const id of [entregue, falhou]) {
        await admin('patch', `/orders/${id}`).send({ vehicle_id: veiculo.body.vehicle_id }).expect(200);
      }

      await post(`${base}/start`, evento(0)).expect(200);
      await post(`${base}/stops/${entregue}/deliver`, evento(10)).expect(200);
      await post(
        `${base}/stops/${falhou}/fail`,
        evento(20, { occurrence_type: 'customer_absent', notes: 'Ninguém atendeu' }),
      ).expect(200);
      await post(`${base}/finish`, evento(30)).expect(200);

      // A coordenada gravada pela seed vale para o endereço: sem isso a
      // otimização tentaria o geocoding, que nos testes usa uma chave falsa.
      const falhouAntes = await dataSource.getRepository(Order).findOneByOrFail({ order_id: falhou });
      await dataSource.getRepository(Order).update(
        { order_id: falhou },
        {
          delivery_geocoded_address:
            app.get(AddressCoordinatesService).keyFor({
              street: falhouAntes.delivery_street,
              number: falhouAntes.delivery_number,
              district: falhouAntes.delivery_district,
              city: falhouAntes.delivery_city,
              state: falhouAntes.delivery_state,
              zipCode: falhouAntes.delivery_zipcode,
            }) ?? undefined,
        },
      );

      // O entregue não volta; o não entregue entra numa rota nova.
      await admin('post', '/optimization-routes/optimize').send({ orderIds: [entregue] }).expect(400);

      const otimizacao = await admin('post', '/optimization-routes/optimize')
        .send({ orderIds: [falhou] })
        .expect(201);
      expect(otimizacao.body).toMatchObject({ totalRoutes: 1, unassignedOrders: [] });
      const pedido = await dataSource.getRepository(Order).findOneBy({ order_id: falhou });
      const novaRotaId = pedido!.route_id!;
      expect(novaRotaId).not.toBe(route.route_id);
      expect(pedido!.status).toBe('planned');

      // A rota antiga continua com a parada, como não entregue.
      const antiga = await admin('get', `/routes/${route.route_id}`).expect(200);
      expect(
        antiga.body.orders.map((o: { order_id: number; status: string }) => [o.order_id, o.status]),
      ).toEqual([
        [entregue, 'delivered'],
        [falhou, 'failed'],
      ]);

      // O histórico do pedido mostra as duas tentativas.
      const tentativas = await admin('get', `/orders/${falhou}/attempts`).expect(200);
      expect(tentativas.body).toEqual([
        expect.objectContaining({
          attempt: 1,
          route_id: route.route_id,
          status: 'failed',
          occurrence_type: 'customer_absent',
          notes: 'Ninguém atendeu',
          completed_at: em(20),
        }),
        expect.objectContaining({ attempt: 2, route_id: novaRotaId, status: 'planned' }),
      ]);

      const lista = await admin('get', '/orders?limit=100').expect(200);
      expect(lista.body.items.find((o: { order_id: number }) => o.order_id === falhou)).toMatchObject({
        attempts: 2,
        last_failure: { route_id: route.route_id, occurrence_type: 'customer_absent' },
      });

      // No aplicativo, a parada da rota nova avisa o que houve na anterior.
      const noApp = await http()
        .get(`/driver/routes/${novaRotaId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(noApp.body.stops[0]).toMatchObject({
        order_id: falhou,
        attempt: 2,
        previous_attempt: { route_id: route.route_id, occurrence_type: 'customer_absent' },
      });
    });
  });

  it('não encerra a rota com parada sem baixa, e diz quais faltam', async () => {
    const { orders, base } = await novaRota(2);

    await post(`${base}/start`, evento(0)).expect(200);
    await post(`${base}/stops/${orders[0].order_id}/deliver`, evento(10)).expect(200);

    const res = await post(`${base}/finish`, evento(20)).expect(400);

    expect(res.body.message).toContain('1 parada(s) sem baixa');
    expect(res.body.errors).toEqual([
      { field: `order_${orders[1].order_id}`, messages: ['Parada 2: Entrega 2'] },
    ]);
  });

  it('exige o motivo da ocorrência', async () => {
    const { orders, base } = await novaRota(1);
    await post(`${base}/start`, evento(0)).expect(200);

    await post(`${base}/stops/${orders[0].order_id}/fail`, evento(5)).expect(400);
    await post(
      `${base}/stops/${orders[0].order_id}/fail`,
      evento(5, { occurrence_type: 'motivo_inexistente' }),
    ).expect(400);
  });

  it('recusa baixa em rota que não foi iniciada', async () => {
    const { orders, base } = await novaRota(1);

    await post(`${base}/stops/${orders[0].order_id}/deliver`, evento(5)).expect(409);
  });

  it('recusa segunda baixa da mesma parada, vinda de outro evento', async () => {
    const { orders, base } = await novaRota(2);
    await post(`${base}/start`, evento(0)).expect(200);
    await post(`${base}/stops/${orders[0].order_id}/deliver`, evento(5)).expect(200);

    await post(
      `${base}/stops/${orders[0].order_id}/fail`,
      evento(6, { occurrence_type: 'refused' }),
    ).expect(409);
  });

  describe('baixa atômica da parada', () => {
    const eventosDaParada = (orderId: number) =>
      rawQuery(
        dataSource,
        "SELECT type FROM route_event WHERE order_id = ? AND type IN ('delivered', 'failed')",
        [orderId],
      );

    it('reenvio depois de uma falha no meio grava tudo, uma vez só', async () => {
      const { orders, base } = await novaRota(1);
      const orderId = orders[0].order_id;
      await post(`${base}/start`, evento(0)).expect(200);
      const body = evento(10, { notes: 'Recebido' });

      // O banco cai na hora de baixar o pedido, depois do evento gravado.
      const falha = jest
        .spyOn(UpdateQueryBuilder.prototype, 'execute')
        .mockRejectedValueOnce(new Error('conexão perdida'));
      await post(`${base}/stops/${orderId}/deliver`, body).expect(500);
      falha.mockRestore();

      // Nada ficou pela metade: nem evento, nem pedido baixado.
      expect(await eventosDaParada(orderId)).toEqual([]);
      const aberto = await dataSource.getRepository(Order).findOneBy({ order_id: orderId });
      expect(aberto!.status).not.toBe('delivered');

      // O aparelho reenvia o mesmo evento e a baixa entra.
      const res = await post(`${base}/stops/${orderId}/deliver`, body).expect(200);
      expect(res.body.stops[0]).toMatchObject({ status: 'delivered', completed_at: em(10) });
      expect(await eventosDaParada(orderId)).toEqual([{ type: 'delivered' }]);

      // E um terceiro envio continua sendo só um "já recebido".
      await post(`${base}/stops/${orderId}/deliver`, body).expect(200);
      expect(await eventosDaParada(orderId)).toHaveLength(1);
    });

    it('entrega e ocorrência ao mesmo tempo: uma vale, a outra recebe 409', async () => {
      const { orders, base } = await novaRota(1);
      const orderId = orders[0].order_id;
      await post(`${base}/start`, evento(0)).expect(200);

      const respostas = await Promise.all([
        post(`${base}/stops/${orderId}/deliver`, evento(10)),
        post(`${base}/stops/${orderId}/fail`, evento(10, { occurrence_type: 'refused' })),
      ]);

      expect(respostas.map((r) => r.status).sort()).toEqual([200, 409]);
      const eventos = await eventosDaParada(orderId);
      expect(eventos).toHaveLength(1);
      const pedido = await dataSource.getRepository(Order).findOneBy({ order_id: orderId });
      expect(pedido!.status).toBe(eventos[0].type);
    });

    it('o mesmo evento chegando duas vezes ao mesmo tempo responde 200 nas duas', async () => {
      const { orders, base } = await novaRota(1);
      const orderId = orders[0].order_id;
      await post(`${base}/start`, evento(0)).expect(200);
      const body = evento(10);

      const respostas = await Promise.all([
        post(`${base}/stops/${orderId}/deliver`, body),
        post(`${base}/stops/${orderId}/deliver`, body),
      ]);

      expect(respostas.map((r) => r.status)).toEqual([200, 200]);
      expect(await eventosDaParada(orderId)).toHaveLength(1);
    });
  });

  it('recusa parada que pertence a outra rota', async () => {
    const a = await novaRota(1);
    const b = await novaRota(1);
    await post(`${a.base}/start`, evento(0)).expect(200);

    await post(`${a.base}/stops/${b.orders[0].order_id}/deliver`, evento(5)).expect(404);
  });

  describe('cancelamento pelo entregador', () => {
    it('cancela a rota em andamento, devolve as paradas abertas e guarda o motivo', async () => {
      const { route, orders, base } = await novaRota(3);
      await post(`${base}/start`, evento(0)).expect(200);
      await post(`${base}/stops/${orders[0].order_id}/deliver`, evento(10)).expect(200);

      const res = await post(`${base}/cancel`, evento(20, { reason: 'Veículo com pneu furado' })).expect(200);

      expect(res.body.status).toBe('cancelled');

      // A entrega feita continua na rota; as paradas abertas voltam para a fila.
      const pedidos = await dataSource.getRepository(Order).find({
        where: orders.map((order) => ({ order_id: order.order_id })),
        order: { order_id: 'ASC' },
      });
      expect(pedidos.map((pedido) => [pedido.status, pedido.route_id])).toEqual([
        ['delivered', route.route_id],
        ['pending', null],
        ['pending', null],
      ]);

      const eventos = await rawQuery(dataSource, 
        "SELECT notes FROM route_event WHERE route_id = ? AND type = 'route_cancelled'",
        [route.route_id],
      );
      expect(eventos).toEqual([{ notes: 'Veículo com pneu furado' }]);

      const motorista = await dataSource.getRepository(Driver).findOneBy({ driver_id: driverId });
      expect(motorista!.status).toBe('available');
    });

    it('a rota cancelada pode ser duplicada com as paradas que ficaram em aberto', async () => {
      const { route, orders, base } = await novaRota(4);
      await post(`${base}/start`, evento(0)).expect(200);
      await post(`${base}/stops/${orders[1].order_id}/deliver`, evento(10)).expect(200);
      await post(`${base}/cancel`, evento(20, { reason: 'Problema mecânico no veículo' })).expect(200);

      const admin = (path: string, body: object = {}) =>
        http().post(path).set('Authorization', `Bearer ${adminToken}`).send(body);

      const lista = await http().get('/routes').set('Authorization', `Bearer ${adminToken}`).expect(200);
      expect(
        lista.body.find((item: { route_id: number }) => item.route_id === route.route_id),
      ).toMatchObject({ status: 'cancelled', returned_stop_count: 3 });

      const nova = await admin(`/routes/${route.route_id}/duplicate`).expect(201);

      // As três em aberto, na ordem original e renumeradas; a entregue fica na rota antiga.
      expect(nova.body).toMatchObject({
        status: 'planned',
        driver_id: driverId,
        duplicated_from_route_id: route.route_id,
        // A original tinha 4 paradas; a nova, 3. A distância planejada não serve mais.
        total_distance_m: null,
      });
      expect(nova.body.orders.map((order: { order_id: number }) => order.order_id)).toEqual([
        orders[0].order_id,
        orders[2].order_id,
        orders[3].order_id,
      ]);
      expect(nova.body.orders.map((order: { stop_sequence: number }) => order.stop_sequence)).toEqual([1, 2, 3]);

      // O motorista enxerga a rota nova no aplicativo.
      const doDia = await http().get('/driver/routes').set('Authorization', `Bearer ${token}`).expect(200);
      expect(doDia.body.map((item: { route_id: number }) => item.route_id)).toContain(nova.body.route_id);

      // As paradas já foram usadas: duplicar de novo não tem o que levar.
      await admin(`/routes/${route.route_id}/duplicate`).expect(400);
    });

    it('não duplica rota que não está cancelada, e o aplicativo não duplica', async () => {
      const { route } = await novaRota(1);

      await http()
        .post(`/routes/${route.route_id}/duplicate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
      await http()
        .post(`/routes/${route.route_id}/duplicate`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(403);
    });

    it('exige o motivo e só cancela rota em andamento', async () => {
      const planejada = await novaRota(1);
      await post(`${planejada.base}/cancel`, evento(0)).expect(400);
      await post(`${planejada.base}/cancel`, evento(0, { reason: 'Sem motivo real' })).expect(409);
    });

    it('reenviar o cancelamento não falha nem registra de novo', async () => {
      const { route, base } = await novaRota(1);
      await post(`${base}/start`, evento(0)).expect(200);
      const body = evento(5, { reason: 'Acidente no trajeto' });

      await post(`${base}/cancel`, body).expect(200);
      await post(`${base}/cancel`, body).expect(200);

      const total = await rawQuery(dataSource, 
        "SELECT COUNT(*) AS total FROM route_event WHERE route_id = ? AND type = 'route_cancelled'",
        [route.route_id],
      );
      expect(Number(total[0].total)).toBe(1);
    });
  });

  describe('fila offline: tudo chega depois, e mais de uma vez', () => {
    it('reenviar a fila inteira não duplica nem muda nada', async () => {
      const { route, orders, base } = await novaRota(2);
      const fila = [
        { path: `${base}/start`, body: evento(0) },
        { path: `${base}/stops/${orders[0].order_id}/arrive`, body: evento(10) },
        { path: `${base}/stops/${orders[0].order_id}/deliver`, body: evento(14) },
        {
          path: `${base}/stops/${orders[1].order_id}/fail`,
          body: evento(30, { occurrence_type: 'closed_establishment' }),
        },
        { path: `${base}/finish`, body: evento(45) },
      ];

      for (const item of fila) await post(item.path, item.body).expect(200);
      // O aparelho não recebeu as respostas e manda tudo de novo.
      for (const item of fila) await post(item.path, item.body).expect(200);

      const eventos = await rawQuery(dataSource, 
        'SELECT type FROM route_event WHERE route_id = ? ORDER BY occurred_at',
        [route.route_id],
      );
      expect(eventos.map((e: { type: string }) => e.type)).toEqual([
        'route_started',
        'arrived',
        'delivered',
        'failed',
        'route_finished',
      ]);

      const rota = await dataSource.getRepository(Route).findOneBy({ route_id: route.route_id });
      expect(new Date(rota!.finished_at!).toISOString()).toBe(em(45));
    });

    it('recusa evento com hora anterior à data da rota', async () => {
      const { base } = await novaRota(1);

      const res = await post(`${base}/start`, {
        client_event_id: randomUUID(),
        occurred_at: new Date(Date.now() - 5 * 24 * 60 * 60_000).toISOString(),
      }).expect(400);
      expect(res.body.message).toContain('anterior à data da rota');
    });

    it('hora do aparelho no futuro é trocada pela hora do servidor', async () => {
      const { route, base } = await novaRota(1);
      const antes = Date.now();

      await post(`${base}/start`, {
        client_event_id: randomUUID(),
        occurred_at: new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString(),
      }).expect(200);

      const rota = await dataSource.getRepository(Route).findOneBy({ route_id: route.route_id });
      const inicio = new Date(rota!.started_at!).getTime();
      expect(inicio).toBeGreaterThanOrEqual(antes - 1000);
      expect(inicio).toBeLessThanOrEqual(Date.now() + 1000);
    });
  });

  describe('rastro de GPS', () => {
    /** Linha reta para o norte: 0,001 grau ≈ 111 m. */
    const rastro = (pontos: number, inicioMin = 0) =>
      Array.from({ length: pontos }, (_, i) => ({
        client_ping_id: randomUUID(),
        recorded_at: em(inicioMin + i * 0.5),
        latitude: -26.5 + i * 0.002,
        longitude: -49.0,
        accuracy_m: 8,
        speed_mps: 7.4,
      }));

    it('grava o lote e ignora os pontos reenviados', async () => {
      const { route, base } = await novaRota(1);
      await post(`${base}/start`, evento(0)).expect(200);
      const points = rastro(120);

      await post(`${base}/locations`, { points }).expect(200).expect({ accepted: 120, rejected: 0 });
      await post(`${base}/locations`, { points }).expect(200);

      const total = await rawQuery(dataSource, 
        'SELECT COUNT(*) AS total FROM route_location_ping WHERE route_id = ?',
        [route.route_id],
      );
      expect(Number(total[0].total)).toBe(120);
    });

    it('descarta, um a um, pontos do futuro ou de antes da rota', async () => {
      const { route, base } = await novaRota(1);
      await post(`${base}/start`, evento(0)).expect(200);
      const agora = Date.now();
      const futuro = Array.from({ length: 3 }, (_, i) => ({
        ...rastro(1)[0],
        recorded_at: new Date(agora + (60 + i) * 60_000).toISOString(),
      }));
      const passado = { ...rastro(1)[0], recorded_at: new Date(agora - 5 * 24 * 60 * 60_000).toISOString() };
      const validos = rastro(4);

      await post(`${base}/locations`, { points: [...validos, ...futuro, passado] })
        .expect(200)
        .expect({ accepted: 4, rejected: 4 });

      // Nenhum ponto do futuro foi "achatado" para a hora do servidor.
      const gravados = await dataSource
        .getRepository(RouteLocationPing)
        .findBy({ route_id: route.route_id });
      expect(gravados).toHaveLength(4);
      for (const ponto of gravados) {
        expect(new Date(ponto.recorded_at).getTime()).toBeLessThan(agora);
      }
    });

    it('recusa lote acima do limite e rota ainda não iniciada', async () => {
      const iniciada = await novaRota(1);
      const planejada = await novaRota(1);
      await post(`${iniciada.base}/start`, evento(0)).expect(200);

      await post(`${iniciada.base}/locations`, { points: rastro(201) }).expect(400);
      await post(`${planejada.base}/locations`, { points: rastro(2) }).expect(409);
    });

    it('rastro que chega depois do encerramento refaz a comparação', async () => {
      const { route, orders, base } = await novaRota(1, { total_distance_m: 5000 });
      await post(`${base}/start`, evento(0)).expect(200);
      await post(`${base}/stops/${orders[0].order_id}/deliver`, evento(20)).expect(200);
      await post(`${base}/finish`, evento(30)).expect(200);

      const semRastro = await rawQuery(dataSource, 
        'SELECT actual_distance_m FROM route_execution_metrics WHERE route_id = ?',
        [route.route_id],
      );
      expect(semRastro[0].actual_distance_m).toBeNull();

      // 26 pontos, 25 trechos de ~222 m.
      await post(`${base}/locations`, { points: rastro(26) }).expect(200);

      const comRastro = await rawQuery(dataSource, 
        'SELECT actual_distance_m, ping_count FROM route_execution_metrics WHERE route_id = ?',
        [route.route_id],
      );
      expect(comRastro[0].ping_count).toBe(26);
      expect(Math.abs(comRastro[0].actual_distance_m - 5560) / 5560).toBeLessThan(0.02);
    });
  });

  describe('consolidação', () => {
    it('consolidações simultâneas da mesma rota gravam uma linha só', async () => {
      const { route, orders, base } = await novaRota(1);
      await post(`${base}/start`, evento(0)).expect(200);
      await post(`${base}/stops/${orders[0].order_id}/deliver`, evento(10)).expect(200);
      await post(`${base}/finish`, evento(20)).expect(200);

      const servico = app.get(RouteMetricsService);
      const resultados = await Promise.all([
        servico.consolidate(route.route_id, route.id_company),
        servico.consolidate(route.route_id, route.id_company),
        servico.consolidate(route.route_id, route.id_company),
      ]);

      expect(resultados.every((r) => r?.route_id === route.route_id)).toBe(true);
      const linhas = await rawQuery(
        dataSource,
        'SELECT COUNT(*) AS total FROM route_execution_metrics WHERE route_id = ?',
        [route.route_id],
      );
      expect(Number(linhas[0].total)).toBe(1);
    });

    it('abrir a comparação de rota encerrada não regrava a consolidação', async () => {
      const { route, orders, base } = await novaRota(1);
      await post(`${base}/start`, evento(0)).expect(200);
      await post(`${base}/stops/${orders[0].order_id}/deliver`, evento(10)).expect(200);
      await post(`${base}/finish`, evento(20)).expect(200);

      const repo = dataSource.getRepository(RouteExecutionMetrics);
      const antes = await repo.findOneByOrFail({ route_id: route.route_id });

      await http()
        .get(`/analytics/routes/${route.route_id}/comparison`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const depois = await repo.findOneByOrFail({ route_id: route.route_id });
      expect(depois.id).toBe(antes.id);
      expect(new Date(depois.computed_at).getTime()).toBe(new Date(antes.computed_at).getTime());
    });
  });

  describe('painel analítico', () => {
    const get = (path: string) => http().get(path).set('Authorization', `Bearer ${adminToken}`);

    it('resume o período com conclusão, ocorrências e comparação', async () => {
      const res = await get('/analytics/overview').expect(200);

      expect(res.body.routes_completed).toBeGreaterThanOrEqual(3);
      expect(res.body.stops_delivered).toBeGreaterThanOrEqual(4);
      expect(res.body.stops_failed).toBeGreaterThanOrEqual(2);
      expect(res.body.completion_rate).toBeGreaterThan(0);
      expect(res.body.routes_with_tracking).toBeGreaterThanOrEqual(1);
      expect(res.body.actual_distance_km).toBeGreaterThan(5);
    });

    it('lista o motorista com o índice de conclusão', async () => {
      const res = await get('/analytics/drivers').expect(200);
      const dani = res.body.find((d: { driver_id: number }) => d.driver_id === driverId);

      expect(dani).toMatchObject({ name: 'Dani Motorista' });
      expect(dani.stops_delivered).toBeGreaterThanOrEqual(4);
      expect(dani.completion_rate).toBeGreaterThan(0);
    });

    it('conta as ocorrências por tipo e traz as mais recentes', async () => {
      const res = await get('/analytics/occurrences').expect(200);
      const ausente = res.body.by_type.find((t: { type: string }) => t.type === 'customer_absent');

      expect(ausente.count).toBeGreaterThanOrEqual(1);
      expect(res.body.recent[0]).toHaveProperty('occurrence_type');
      expect(res.body.total).toBe(
        res.body.by_type.reduce((sum: number, t: { count: number }) => sum + t.count, 0),
      );
    });

    it('agrupa por região e faixa do dia', async () => {
      const res = await get('/analytics/regions').expect(200);

      expect(res.body[0]).toMatchObject({ region: 'Centro — Jaraguá do Sul' });
      expect(['morning', 'afternoon', 'evening']).toContain(res.body[0].period);
    });

    it('compara uma rota parada a parada e devolve o trajeto', async () => {
      const rotas = await get('/analytics/routes').expect(200);
      const comRastro = rotas.body.find((r: { has_tracking: boolean }) => r.has_tracking);

      const res = await get(`/analytics/routes/${comRastro.route_id}/comparison`).expect(200);

      expect(res.body.summary.actual_distance_m).toBeGreaterThan(0);
      expect(res.body.stops[0]).toHaveProperty('planned_sequence', 1);
      expect(res.body.path.length).toBeGreaterThan(1);
    });

    it('recusa período invertido e é fechado para o aplicativo', async () => {
      await get('/analytics/overview?from=2026-10-08&to=2026-10-01').expect(400);
      await http().get('/analytics/overview').set('Authorization', `Bearer ${token}`).expect(403);
    });
  });
});
