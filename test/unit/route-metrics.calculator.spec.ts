import {
  computeRouteMetrics,
  haversineMeters,
  idleTimeMs,
  MetricsInput,
  MetricsPingInput,
  traveledDistanceMeters,
} from '@/modules/analytics/route-metrics.calculator';

/**
 * A comparação planejado × executado é o resultado central do TCC, e o
 * cálculo é cheio de decisões que mudam o número final: o que é oscilação
 * de GPS, o que é parada, o que é fora de ordem. Estes testes fixam essas
 * decisões com rastros de resposta conhecida.
 */
describe('route-metrics.calculator', () => {
  const T0 = Date.parse('2026-10-08T12:00:00.000Z');
  const em = (minutos: number) => new Date(T0 + minutos * 60_000);

  /** 0,001 grau de latitude ≈ 111,19 m. */
  const GRAU_M = 111194.9;
  const ponto = (minutos: number, metrosAoNorte: number, extra: Partial<MetricsPingInput> = {}) =>
    ({
      latitude: -26.5 + metrosAoNorte / GRAU_M,
      longitude: -49.0,
      accuracy_m: 8,
      recorded_at: em(minutos),
      ...extra,
    }) as MetricsPingInput;

  const base = (extra: Partial<MetricsInput> = {}): MetricsInput => ({
    planned_distance_m: 10000,
    planned_duration_min: 60,
    started_at: em(0),
    finished_at: em(90),
    simulated: false,
    stops: [],
    events: [],
    pings: [],
    ...extra,
  });

  describe('haversineMeters', () => {
    it('mede um grau de latitude', () => {
      const d = haversineMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });
      expect(d).toBeGreaterThan(111000);
      expect(d).toBeLessThan(111400);
    });
  });

  describe('traveledDistanceMeters', () => {
    it('soma um trajeto em linha reta dentro de 2% do valor real', () => {
      // 5 km para o norte, um ponto a cada 250 m e 30 s.
      const pings = Array.from({ length: 21 }, (_, i) => ponto(i * 0.5, i * 250));

      const distancia = traveledDistanceMeters(pings)!;

      expect(Math.abs(distancia - 5000) / 5000).toBeLessThan(0.02);
    });

    it('não inventa quilômetros com o veículo parado', () => {
      // 30 min no mesmo lugar, com o GPS oscilando 4 m para cada lado.
      const pings = Array.from({ length: 120 }, (_, i) => ponto(i * 0.25, i % 2 === 0 ? 4 : -4));

      expect(traveledDistanceMeters(pings)).toBe(0);
    });

    it('conta o deslocamento lento, mesmo em passos menores que o limiar', () => {
      // 6 m por leitura: cada passo fica abaixo de 10 m, mas o veículo anda 600 m.
      const pings = Array.from({ length: 101 }, (_, i) => ponto(i * 0.1, i * 6));

      const distancia = traveledDistanceMeters(pings)!;

      expect(distancia).toBeGreaterThan(560);
      expect(distancia).toBeLessThanOrEqual(600);
    });

    it('descarta pontos imprecisos', () => {
      const pings = [
        ponto(0, 0),
        ponto(1, 5000, { accuracy_m: 400 }),
        ponto(2, 200),
      ];

      expect(traveledDistanceMeters(pings)).toBeCloseTo(200, -1);
    });

    it('ignora salto que exigiria velocidade impossível', () => {
      const pings = [ponto(0, 0), ponto(0.1, 20000), ponto(1, 300)];

      expect(traveledDistanceMeters(pings)).toBeCloseTo(300, -1);
    });

    it('devolve null sem rastro suficiente', () => {
      expect(traveledDistanceMeters([])).toBeNull();
      expect(traveledDistanceMeters([ponto(0, 0)])).toBeNull();
    });

    it('não depende da ordem de chegada dos pontos', () => {
      const pings = [ponto(2, 500), ponto(0, 0), ponto(1, 250)];

      expect(traveledDistanceMeters(pings)).toBeCloseTo(500, -1);
    });
  });

  describe('idleTimeMs', () => {
    const parado = (deMin: number, ateMin: number, metros: number) =>
      Array.from({ length: (ateMin - deMin) * 2 + 1 }, (_, i) => ponto(deMin + i * 0.5, metros));

    it('conta o tempo parado fora de uma parada', () => {
      const pings = [...parado(0, 10, 0), ponto(11, 1000)];

      expect(idleTimeMs(pings, [])).toBe(10 * 60_000);
    });

    it('não conta o tempo de atendimento como ocioso', () => {
      const pings = [...parado(0, 10, 0), ponto(11, 1000)];
      const atendimento = [{ start: em(2).getTime(), end: em(8).getTime() }];

      expect(idleTimeMs(pings, atendimento)).toBe(4 * 60_000);
    });

    it('ignora parada curta, como um semáforo', () => {
      const pings = [...parado(0, 1, 0), ponto(2, 1000), ponto(3, 2000)];

      expect(idleTimeMs(pings, [])).toBe(0);
    });

    it('não assume que o veículo ficou parado durante uma falha de leitura', () => {
      // Mesmo lugar, mas com 40 min sem nenhum ponto entre as duas leituras.
      const pings = [ponto(0, 0), ponto(1, 0), ponto(41, 0), ponto(42, 0)];

      expect(idleTimeMs(pings, [])).toBe(0);
    });
  });

  describe('computeRouteMetrics', () => {
    const paradas = [
      { order_id: 1, status: 'delivered', planned_sequence: 1, planned_arrival: em(10).toISOString() },
      { order_id: 2, status: 'delivered', planned_sequence: 2, planned_arrival: em(30).toISOString() },
      { order_id: 3, status: 'failed', planned_sequence: 3, planned_arrival: em(50).toISOString() },
    ];

    const visita = (orderId: number, chegada: number, saida: number, tipo = 'delivered') => [
      { order_id: orderId, type: 'arrived', occurred_at: em(chegada) },
      {
        order_id: orderId,
        type: tipo,
        occurred_at: em(saida),
        occurrence_type: tipo === 'failed' ? 'customer_absent' : null,
      },
    ];

    it('compara duração, atraso e tempo de atendimento', () => {
      const result = computeRouteMetrics(
        base({
          stops: paradas,
          events: [...visita(1, 15, 20), ...visita(2, 30, 40), ...visita(3, 70, 75, 'failed')],
        }),
      );

      expect(result.actual_duration_min).toBe(90);
      expect(result.stops_delivered).toBe(2);
      expect(result.stops_failed).toBe(1);
      expect(result.stops_out_of_order).toBe(0);
      expect(result.stops.map((s) => s.delay_min)).toEqual([5, 0, 20]);
      expect(result.stops.map((s) => s.service_min)).toEqual([5, 10, 5]);
      expect(result.avg_service_min).toBeCloseTo(6.7, 1);
      expect(result.avg_delay_min).toBeCloseTo(8.3, 1);
      expect(result.stops[2].occurrence_type).toBe('customer_absent');
    });

    it('sinaliza as paradas visitadas fora da ordem planejada', () => {
      const result = computeRouteMetrics(
        base({
          stops: paradas,
          // Planejado 1, 2, 3; executado 2, 1, 3.
          events: [...visita(2, 10, 15), ...visita(1, 25, 30), ...visita(3, 50, 55, 'failed')],
        }),
      );

      expect(result.stops_out_of_order).toBe(2);
      expect(result.stops.map((s) => s.actual_sequence)).toEqual([2, 1, 3]);
    });

    it('uma parada pulada não torna as seguintes fora de ordem', () => {
      const result = computeRouteMetrics(
        base({
          stops: [{ ...paradas[0], status: 'in_route' }, paradas[1], paradas[2]],
          events: [...visita(2, 30, 35), ...visita(3, 50, 55, 'failed')],
        }),
      );

      expect(result.stops_out_of_order).toBe(0);
      expect(result.stops[0].actual_sequence).toBeNull();
    });

    it('sem "cheguei", usa a hora da baixa como chegada e não inventa tempo de atendimento', () => {
      const result = computeRouteMetrics(
        base({
          stops: [paradas[0]],
          events: [{ order_id: 1, type: 'delivered', occurred_at: em(18) }],
        }),
      );

      expect(result.stops[0].delay_min).toBe(8);
      expect(result.stops[0].service_min).toBeNull();
      expect(result.avg_service_min).toBeNull();
    });

    it('não calcula atraso em rota simulada, cuja previsão não tem valor operacional', () => {
      const result = computeRouteMetrics(
        base({ simulated: true, stops: [paradas[0]], events: visita(1, 40, 45) }),
      );

      expect(result.stops[0].delay_min).toBeNull();
      expect(result.avg_delay_min).toBeNull();
    });

    it('rota sem rastro fica sem distância executada, em vez de zero', () => {
      const result = computeRouteMetrics(base({ stops: paradas }));

      expect(result.actual_distance_m).toBeNull();
      expect(result.idle_time_min).toBeNull();
      expect(result.ping_count).toBe(0);
    });

    it('repassa o planejado e mede o executado pelo rastro', () => {
      const pings = Array.from({ length: 41 }, (_, i) => ponto(i * 0.5, i * 300));

      const result = computeRouteMetrics(base({ pings }));

      expect(result.planned_distance_m).toBe(10000);
      expect(Math.abs(result.actual_distance_m! - 12000) / 12000).toBeLessThan(0.02);
      expect(result.ping_count).toBe(41);
    });
  });
});
