import { StopExecution } from '../../shared/entities/route-execution-metrics.entity';

/**
 * Cálculo da comparação entre rota planejada e rota executada.
 *
 * Função pura, sem banco: recebe o que foi planejado, os eventos e o rastro,
 * e devolve os números. Fica separada do serviço para que as regras — o que
 * conta como deslocamento, o que conta como tempo parado — possam ser
 * testadas com rastros conhecidos.
 */

/** Ponto com incerteza acima disto não entra na conta de distância. */
export const MAX_ACCURACY_M = 50;

/**
 * Deslocamento mínimo para considerar que o veículo saiu do lugar. Parado, o
 * GPS oscila alguns metros a cada leitura; somar essa oscilação inventaria
 * quilômetros ao longo de um dia.
 */
export const MIN_MOVE_M = 10;

/** Salto que exigiria velocidade acima disto é erro de leitura, não trajeto. */
export const MAX_SPEED_MPS = 50;

/** Raio dentro do qual o veículo é considerado parado no mesmo ponto. */
export const IDLE_RADIUS_M = 30;

/** Parada mais curta que isto é semáforo, não ociosidade. */
export const MIN_IDLE_MS = 2 * 60 * 1000;

/** Sem leitura por mais tempo que isto, não dá para afirmar o que o veículo fazia. */
export const MAX_PING_GAP_MS = 5 * 60 * 1000;

export interface MetricsStopInput {
  order_id: number;
  status: string;
  planned_sequence: number | null;
  planned_arrival: string | null;
}

export interface MetricsEventInput {
  order_id: number | null | undefined;
  type: string;
  occurred_at: Date;
  occurrence_type?: string | null;
}

export interface MetricsPingInput {
  latitude: number;
  longitude: number;
  accuracy_m?: number | null;
  recorded_at: Date;
}

export interface MetricsInput {
  planned_distance_m: number | null;
  planned_duration_min: number | null;
  started_at: Date | null;
  finished_at: Date | null;
  /** Rota simulada tem previsão de chegada sem valor operacional: atraso não é calculado. */
  simulated: boolean;
  stops: MetricsStopInput[];
  events: MetricsEventInput[];
  pings: MetricsPingInput[];
}

export interface MetricsResult {
  planned_distance_m: number | null;
  actual_distance_m: number | null;
  planned_duration_min: number | null;
  actual_duration_min: number | null;
  stops_total: number;
  stops_delivered: number;
  stops_failed: number;
  stops_out_of_order: number;
  idle_time_min: number | null;
  avg_service_min: number | null;
  avg_delay_min: number | null;
  ping_count: number;
  stops: StopExecution[];
  /** Onde o veículo parou fora de uma entrega. Não é gravado: serve ao mapa do percurso. */
  idle_stops: IdleStop[];
}

const EARTH_RADIUS_M = 6371000;

export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Pontos aproveitáveis, em ordem de leitura. */
export function usablePings(pings: MetricsPingInput[]): MetricsPingInput[] {
  return pings
    .filter(
      (ping) =>
        Number.isFinite(ping.latitude) &&
        Number.isFinite(ping.longitude) &&
        (ping.accuracy_m == null || ping.accuracy_m <= MAX_ACCURACY_M),
    )
    .sort((a, b) => a.recorded_at.getTime() - b.recorded_at.getTime());
}

/**
 * Distância percorrida. Só avança quando o veículo se afasta `MIN_MOVE_M` do
 * último ponto contado, o que descarta a oscilação do GPS parado sem perder
 * o deslocamento lento.
 */
export function traveledDistanceMeters(pings: MetricsPingInput[]): number | null {
  const pontos = usablePings(pings);
  if (pontos.length < 2) return null;

  let total = 0;
  let ancora = pontos[0];

  for (const ponto of pontos.slice(1)) {
    const distancia = haversineMeters(ancora, ponto);
    if (distancia < MIN_MOVE_M) continue;

    const segundos = (ponto.recorded_at.getTime() - ancora.recorded_at.getTime()) / 1000;
    if (segundos > 0 && distancia / segundos > MAX_SPEED_MPS) {
      // Salto impossível: ignora o ponto e mantém a âncora.
      continue;
    }

    total += distancia;
    ancora = ponto;
  }

  return Math.round(total);
}

/** Um trecho em que o veículo ficou parado fora de uma parada de entrega. */
export interface IdleStop {
  latitude: number;
  longitude: number;
  started_at: Date;
  ended_at: Date;
  /** Tempo parado, já descontado o que coincidiu com um atendimento. */
  duration_ms: number;
}

/**
 * Onde e por quanto tempo o veículo ficou parado fora das paradas de
 * entrega: permaneceu no mesmo ponto por mais de `MIN_IDLE_MS` sem que
 * houvesse um atendimento em curso.
 */
export function idleStops(
  pings: MetricsPingInput[],
  serviceWindows: Array<{ start: number; end: number }>,
): IdleStop[] {
  const pontos = usablePings(pings);
  if (pontos.length < 2) return [];

  const paradas: IdleStop[] = [];
  let inicio = pontos[0];
  let anterior = pontos[0];

  const fechar = () => {
    const de = inicio.recorded_at.getTime();
    const ate = anterior.recorded_at.getTime();
    if (ate - de < MIN_IDLE_MS) return;

    const emAtendimento = serviceWindows.reduce((soma, janela) => {
      const sobreposicao = Math.min(ate, janela.end) - Math.max(de, janela.start);
      return soma + Math.max(0, sobreposicao);
    }, 0);

    const duracao = Math.max(0, ate - de - emAtendimento);
    // Sobrou menos que o mínimo: a parada era, na prática, o atendimento.
    if (duracao < MIN_IDLE_MS) return;

    paradas.push({
      latitude: inicio.latitude,
      longitude: inicio.longitude,
      started_at: inicio.recorded_at,
      ended_at: anterior.recorded_at,
      duration_ms: duracao,
    });
  };

  for (const ponto of pontos.slice(1)) {
    const saiuDoLugar = haversineMeters(inicio, ponto) > IDLE_RADIUS_M;
    const semLeitura =
      ponto.recorded_at.getTime() - anterior.recorded_at.getTime() > MAX_PING_GAP_MS;

    if (saiuDoLugar || semLeitura) {
      fechar();
      inicio = ponto;
    }
    anterior = ponto;
  }
  fechar();

  return paradas;
}

/** Soma do tempo parado fora das paradas de entrega; null sem rastro suficiente. */
export function idleTimeMs(
  pings: MetricsPingInput[],
  serviceWindows: Array<{ start: number; end: number }>,
): number | null {
  if (usablePings(pings).length < 2) return null;
  return idleStops(pings, serviceWindows).reduce((soma, parada) => soma + parada.duration_ms, 0);
}

const minutes = (ms: number) => Math.round((ms / 60000) * 10) / 10;

const average = (values: number[]): number | null =>
  values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;

export function computeRouteMetrics(input: MetricsInput): MetricsResult {
  const eventsByOrder = new Map<number, MetricsEventInput[]>();
  for (const event of [...input.events].sort(
    (a, b) => a.occurred_at.getTime() - b.occurred_at.getTime(),
  )) {
    if (!event.order_id) continue;
    const lista = eventsByOrder.get(event.order_id) ?? [];
    lista.push(event);
    eventsByOrder.set(event.order_id, lista);
  }

  const parciais = input.stops.map((stop) => {
    const events = eventsByOrder.get(stop.order_id) ?? [];
    const arrived = events.find((event) => event.type === 'arrived');
    const final = [...events]
      .reverse()
      .find((event) => event.type === 'delivered' || event.type === 'failed');

    // Sem "cheguei", a própria baixa é o melhor registro de quando ele esteve lá.
    const actualArrival = arrived?.occurred_at ?? final?.occurred_at ?? null;
    const plannedArrival = stop.planned_arrival ? new Date(stop.planned_arrival) : null;
    const plannedValido = plannedArrival && !Number.isNaN(plannedArrival.getTime());

    return {
      stop,
      actualArrival,
      completedAt: final?.occurred_at ?? null,
      delay_min:
        !input.simulated && plannedValido && actualArrival
          ? minutes(actualArrival.getTime() - plannedArrival.getTime())
          : null,
      service_min:
        arrived && final ? minutes(final.occurred_at.getTime() - arrived.occurred_at.getTime()) : null,
      occurrence_type: final?.type === 'failed' ? (final.occurrence_type ?? null) : null,
      window:
        arrived && final
          ? { start: arrived.occurred_at.getTime(), end: final.occurred_at.getTime() }
          : null,
    };
  });

  // Ordem real: a sequência em que as paradas foram visitadas.
  const visitadas = parciais
    .filter((item) => item.actualArrival)
    .sort((a, b) => a.actualArrival!.getTime() - b.actualArrival!.getTime());
  const ordemReal = new Map(visitadas.map((item, index) => [item.stop.order_id, index + 1]));

  // Ordem planejada, contando só as paradas visitadas: uma parada pulada não
  // deve fazer todas as seguintes parecerem fora de ordem.
  const ordemPlanejada = new Map(
    [...visitadas]
      .sort(
        (a, b) =>
          (a.stop.planned_sequence ?? Number.MAX_SAFE_INTEGER) -
          (b.stop.planned_sequence ?? Number.MAX_SAFE_INTEGER),
      )
      .map((item, index) => [item.stop.order_id, index + 1]),
  );

  const stops: StopExecution[] = parciais.map((item) => ({
    order_id: item.stop.order_id,
    status: item.stop.status,
    planned_sequence: item.stop.planned_sequence,
    actual_sequence: ordemReal.get(item.stop.order_id) ?? null,
    planned_arrival: item.stop.planned_arrival,
    actual_arrival: item.actualArrival?.toISOString() ?? null,
    completed_at: item.completedAt?.toISOString() ?? null,
    delay_min: item.delay_min,
    service_min: item.service_min,
    occurrence_type: item.occurrence_type,
  }));

  const foraDeOrdem = visitadas.filter(
    (item) => ordemReal.get(item.stop.order_id) !== ordemPlanejada.get(item.stop.order_id),
  ).length;

  const janelas = parciais
    .map((item) => item.window)
    .filter((janela): janela is { start: number; end: number } => !!janela);
  const ocioso = idleTimeMs(input.pings, janelas);
  const paradasOciosas = idleStops(input.pings, janelas);

  return {
    planned_distance_m: input.planned_distance_m,
    actual_distance_m: traveledDistanceMeters(input.pings),
    planned_duration_min: input.planned_duration_min,
    actual_duration_min:
      input.started_at && input.finished_at
        ? Math.max(0, Math.round((input.finished_at.getTime() - input.started_at.getTime()) / 60000))
        : null,
    stops_total: input.stops.length,
    stops_delivered: input.stops.filter((stop) => stop.status === 'delivered').length,
    stops_failed: input.stops.filter((stop) => stop.status === 'failed').length,
    stops_out_of_order: foraDeOrdem,
    idle_time_min: ocioso == null ? null : Math.round(ocioso / 60000),
    avg_service_min: average(
      parciais.map((item) => item.service_min).filter((v): v is number => v != null),
    ),
    avg_delay_min: average(
      parciais.map((item) => item.delay_min).filter((v): v is number => v != null),
    ),
    ping_count: usablePings(input.pings).length,
    stops,
    idle_stops: paradasOciosas,
  };
}
