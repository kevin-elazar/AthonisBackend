import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { Route } from '../../shared/entities/route.entity';
import { Order } from '../../shared/entities/order.entity';
import { Company } from '../../shared/entities/company.entity';
import { RouteEvent } from '../../shared/entities/route-event.entity';
import { RouteLocationPing } from '../../shared/entities/route-location-ping.entity';
import {
  RouteExecutionMetrics,
  StopExecution,
} from '../../shared/entities/route-execution-metrics.entity';
import { OCCURRENCE_TYPES } from '../../shared/domain/enums';
import { todayInTimeZone } from '../../shared/domain/timezone';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';
import { RouteMetricsService } from './route-metrics.service';
import { FindAnalyticsDto } from './dto/find-analytics.dto';

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const DEFAULT_PERIOD_DAYS = 30;

/** Chegada até este atraso ainda conta como pontual. */
const ON_TIME_TOLERANCE_MIN = 15;

/** Teto de pontos devolvidos para desenhar o trajeto de uma rota. */
const MAX_PATH_POINTS = 500;

/** Rotas concluídas sem consolidação que uma única consulta do painel aceita consolidar. */
const MAX_LAZY_CONSOLIDATIONS = 50;

export type DayPeriod = 'morning' | 'afternoon' | 'evening';

interface Dataset {
  from: string;
  to: string;
  timezone: string;
  routes: Route[];
  orders: Order[];
  events: RouteEvent[];
  metrics: Map<number, RouteExecutionMetrics>;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

const average = (values: number[]): number | null =>
  values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null;

const rate = (part: number, total: number): number | null =>
  total > 0 ? round1((part / total) * 100) : null;

const km = (meters: number): number => round1(meters / 1000);

const toIso = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** Faixa do dia em que o instante cai, no fuso da empresa. */
export function dayPeriod(instant: Date, timeZone: string): DayPeriod {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', hour: '2-digit' }).format(instant),
  );
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/**
 * Indicadores do painel analítico.
 *
 * Tudo sai de quatro fontes: as rotas do período, seus pedidos, os eventos
 * registrados pelo aplicativo e a consolidação planejado × executado. As
 * agregações são feitas aqui em vez de em SQL para valerem igual em SQLite e
 * em PostgreSQL; o volume de um período (dezenas de rotas) não justifica o
 * contrário.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Route)
    private routeRepository: Repository<Route>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(RouteEvent)
    private eventRepository: Repository<RouteEvent>,
    @InjectRepository(RouteLocationPing)
    private pingRepository: Repository<RouteLocationPing>,
    @InjectRepository(RouteExecutionMetrics)
    private metricsRepository: Repository<RouteExecutionMetrics>,
    private routeMetricsService: RouteMetricsService,
    private tenantContext: TenantContextService,
  ) {}

  async overview(query: FindAnalyticsDto) {
    const data = await this.load(query);
    const stops = this.stopExecutions(data);
    const metrics = [...data.metrics.values()];

    const delivered = data.orders.filter((order) => order.status === 'delivered').length;
    const failed = data.orders.filter((order) => order.status === 'failed').length;
    const delays = stops.map((stop) => stop.delay_min).filter((v): v is number => v != null);
    const rastreadas = metrics.filter((item) => item.actual_distance_m != null);

    return {
      period: { from: data.from, to: data.to },
      routes_total: data.routes.length,
      routes_completed: data.routes.filter((route) => route.status === 'completed').length,
      routes_with_tracking: rastreadas.length,
      stops_total: data.orders.length,
      stops_delivered: delivered,
      stops_failed: failed,
      stops_pending: data.orders.length - delivered - failed,
      completion_rate: rate(delivered, data.orders.length),
      on_time_rate: rate(
        delays.filter((delay) => delay <= ON_TIME_TOLERANCE_MIN).length,
        delays.length,
      ),
      avg_delay_min: average(delays),
      avg_service_min: average(
        stops.map((stop) => stop.service_min).filter((v): v is number => v != null),
      ),
      // Distância só entra na comparação para rotas com rastro: somar o
      // planejado de rotas sem GPS faria o executado parecer menor do que foi.
      planned_distance_km: km(rastreadas.reduce((sum, item) => sum + (item.planned_distance_m ?? 0), 0)),
      actual_distance_km: km(rastreadas.reduce((sum, item) => sum + (item.actual_distance_m ?? 0), 0)),
      planned_duration_min: metrics
        .filter((item) => item.actual_duration_min != null)
        .reduce((sum, item) => sum + (item.planned_duration_min ?? 0), 0),
      actual_duration_min: metrics.reduce((sum, item) => sum + (item.actual_duration_min ?? 0), 0),
      idle_time_min: metrics.reduce((sum, item) => sum + (item.idle_time_min ?? 0), 0),
      stops_out_of_order: metrics.reduce((sum, item) => sum + (item.stops_out_of_order ?? 0), 0),
      occurrences_total: failed,
    };
  }

  /** Índice de conclusão e ritmo de cada motorista no período. */
  async drivers(query: FindAnalyticsDto) {
    const data = await this.load(query);
    const stopsByRoute = this.stopExecutionsByRoute(data);

    const porMotorista = new Map<
      number,
      { name: string; routes: Route[] }
    >();
    for (const route of data.routes) {
      if (!route.driver_id) continue;
      const item = porMotorista.get(route.driver_id) ?? {
        name: route.driver?.name ?? `Motorista ${route.driver_id}`,
        routes: [],
      };
      item.routes.push(route);
      porMotorista.set(route.driver_id, item);
    }

    return [...porMotorista.entries()]
      .map(([driverId, item]) => {
        const routeIds = new Set(item.routes.map((route) => route.route_id));
        const orders = data.orders.filter((order) => routeIds.has(order.route_id));
        const stops = item.routes.flatMap((route) => stopsByRoute.get(route.route_id) ?? []);
        const metrics = item.routes
          .map((route) => data.metrics.get(route.route_id))
          .filter((m): m is RouteExecutionMetrics => !!m);
        const delivered = orders.filter((order) => order.status === 'delivered').length;
        const failed = orders.filter((order) => order.status === 'failed').length;

        return {
          driver_id: driverId,
          name: item.name,
          routes: item.routes.length,
          stops_total: orders.length,
          stops_delivered: delivered,
          stops_failed: failed,
          completion_rate: rate(delivered, orders.length),
          avg_service_min: average(
            stops.map((stop) => stop.service_min).filter((v): v is number => v != null),
          ),
          avg_delay_min: average(
            stops.map((stop) => stop.delay_min).filter((v): v is number => v != null),
          ),
          actual_distance_km: km(metrics.reduce((sum, m) => sum + (m.actual_distance_m ?? 0), 0)),
          stops_out_of_order: metrics.reduce((sum, m) => sum + (m.stops_out_of_order ?? 0), 0),
        };
      })
      .sort((a, b) => b.stops_total - a.stops_total);
  }

  /** Tempo de atendimento e atraso por bairro e faixa do dia. */
  async regions(query: FindAnalyticsDto) {
    const data = await this.load(query);
    const stops = new Map(this.stopExecutions(data).map((stop) => [stop.order_id, stop]));

    const grupos = new Map<
      string,
      { region: string; period: DayPeriod; services: number[]; delays: number[]; stops: number; failed: number }
    >();

    for (const order of data.orders) {
      const stop = stops.get(order.order_id);
      const quando = stop?.completed_at ?? stop?.actual_arrival;
      if (!quando) continue;

      const region = `${order.delivery_district} — ${order.delivery_city}`;
      const period = dayPeriod(new Date(quando), data.timezone);
      const chave = `${region}|${period}`;
      const grupo = grupos.get(chave) ?? { region, period, services: [], delays: [], stops: 0, failed: 0 };

      grupo.stops += 1;
      if (order.status === 'failed') grupo.failed += 1;
      if (stop?.service_min != null) grupo.services.push(stop.service_min);
      if (stop?.delay_min != null) grupo.delays.push(stop.delay_min);
      grupos.set(chave, grupo);
    }

    return [...grupos.values()]
      .map((grupo) => ({
        region: grupo.region,
        period: grupo.period,
        stops: grupo.stops,
        stops_failed: grupo.failed,
        avg_service_min: average(grupo.services),
        avg_delay_min: average(grupo.delays),
      }))
      .sort((a, b) => b.stops - a.stops);
  }

  /** Frequência por tipo de ocorrência e as ocorrências mais recentes. */
  async occurrences(query: FindAnalyticsDto) {
    const data = await this.load(query);
    const orders = new Map(data.orders.map((order) => [order.order_id, order]));
    const routes = new Map(data.routes.map((route) => [route.route_id, route]));

    // Uma parada só tem uma ocorrência válida: a do evento que a encerrou.
    const falhas = data.events.filter(
      (event) =>
        event.type === 'failed' && event.order_id && orders.get(event.order_id)?.status === 'failed',
    );

    const contagem = new Map<string, number>(OCCURRENCE_TYPES.map((type) => [type, 0]));
    for (const event of falhas) {
      const type = event.occurrence_type ?? 'other';
      contagem.set(type, (contagem.get(type) ?? 0) + 1);
    }

    return {
      total: falhas.length,
      by_type: [...contagem.entries()]
        .map(([type, count]) => ({ type, count, share: rate(count, falhas.length) }))
        .sort((a, b) => b.count - a.count),
      recent: [...falhas]
        .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
        .slice(0, 20)
        .map((event) => {
          const order = orders.get(event.order_id as number);
          const route = routes.get(event.route_id);
          return {
            route_id: event.route_id,
            order_id: event.order_id,
            order_title: order?.title ?? null,
            client_name: order?.client?.trade_name || order?.client?.name || null,
            driver_name: route?.driver?.name ?? null,
            occurrence_type: event.occurrence_type ?? 'other',
            notes: event.notes ?? null,
            occurred_at: toIso(event.occurred_at),
          };
        }),
    };
  }

  /** Rotas executadas no período, com o resumo da comparação de cada uma. */
  async routes(query: FindAnalyticsDto) {
    const data = await this.load(query);

    return data.routes
      .map((route) => {
        const orders = data.orders.filter((order) => order.route_id === route.route_id);
        const metrics = data.metrics.get(route.route_id);
        return {
          route_id: route.route_id,
          status: route.status,
          planned_date: route.planned_date ? String(route.planned_date).slice(0, 10) : null,
          region: route.region ?? null,
          driver_name: route.driver?.name ?? null,
          simulated: !!route.simulated,
          stops_total: orders.length,
          stops_delivered: orders.filter((order) => order.status === 'delivered').length,
          stops_failed: orders.filter((order) => order.status === 'failed').length,
          planned_distance_m: route.total_distance_m ?? null,
          actual_distance_m: metrics?.actual_distance_m ?? null,
          planned_duration_min: route.total_duration_min ?? null,
          actual_duration_min: metrics?.actual_duration_min ?? null,
          stops_out_of_order: metrics?.stops_out_of_order ?? null,
          has_tracking: (metrics?.ping_count ?? 0) > 1,
        };
      })
      .sort((a, b) => (b.planned_date ?? '').localeCompare(a.planned_date ?? '') || b.route_id - a.route_id);
  }

  /** Planejado × executado de uma rota, parada a parada, com o trajeto percorrido. */
  async comparison(routeId: number) {
    const idCompany = this.tenantContext.getIdCompany();

    const route = await this.routeRepository.findOne({
      where: { route_id: routeId, id_company: idCompany },
      relations: ['driver', 'vehicle'],
    });
    if (!route) {
      throw new NotFoundException(`Rota ${routeId} não encontrada`);
    }

    // Rota em andamento é calculada na hora e não fica gravada: os números
    // ainda vão mudar. A consolidação definitiva acontece no encerramento.
    const metrics =
      route.status === 'completed'
        ? await this.routeMetricsService.consolidate(routeId, idCompany)
        : await this.routeMetricsService.compute(routeId, idCompany);

    const [orders, events, pings] = await Promise.all([
      this.orderRepository.find({
        where: { route_id: routeId, id_company: idCompany },
        relations: ['client'],
        order: { stop_sequence: 'ASC' },
      }),
      this.eventRepository.find({
        where: { route_id: routeId, id_company: idCompany },
        order: { occurred_at: 'ASC' },
      }),
      this.pingRepository.find({
        where: { route_id: routeId, id_company: idCompany },
        select: ['latitude', 'longitude', 'recorded_at'],
        order: { recorded_at: 'ASC' },
      }),
    ]);

    const executions = new Map((metrics?.stops ?? []).map((stop) => [stop.order_id, stop]));
    const passo = Math.max(1, Math.ceil(pings.length / MAX_PATH_POINTS));

    return {
      route: {
        route_id: route.route_id,
        status: route.status,
        planned_date: route.planned_date ? String(route.planned_date).slice(0, 10) : null,
        region: route.region ?? null,
        simulated: !!route.simulated,
        driver_name: route.driver?.name ?? null,
        vehicle_name: route.vehicle?.name ?? null,
        started_at: toIso(route.started_at),
        finished_at: toIso(route.finished_at),
      },
      summary: metrics
        ? {
            planned_distance_m: metrics.planned_distance_m ?? null,
            actual_distance_m: metrics.actual_distance_m ?? null,
            planned_duration_min: metrics.planned_duration_min ?? null,
            actual_duration_min: metrics.actual_duration_min ?? null,
            stops_total: metrics.stops_total,
            stops_delivered: metrics.stops_delivered,
            stops_failed: metrics.stops_failed,
            stops_out_of_order: metrics.stops_out_of_order,
            idle_time_min: metrics.idle_time_min ?? null,
            avg_service_min: metrics.avg_service_min ?? null,
            avg_delay_min: metrics.avg_delay_min ?? null,
            ping_count: metrics.ping_count,
          }
        : null,
      stops: orders.map((order) => {
        const execution = executions.get(order.order_id);
        const final = [...events]
          .reverse()
          .find(
            (event) =>
              event.order_id === order.order_id &&
              (event.type === 'delivered' || event.type === 'failed'),
          );
        return {
          order_id: order.order_id,
          title: order.title,
          client_name: order.client?.trade_name || order.client?.name || null,
          address: `${order.delivery_street}, ${order.delivery_number} — ${order.delivery_district}`,
          latitude: order.delivery_latitude ?? null,
          longitude: order.delivery_longitude ?? null,
          status: order.status,
          planned_sequence: order.stop_sequence ?? null,
          actual_sequence: execution?.actual_sequence ?? null,
          planned_arrival: execution?.planned_arrival ?? null,
          actual_arrival: execution?.actual_arrival ?? null,
          completed_at: execution?.completed_at ?? toIso(order.delivered_at),
          delay_min: execution?.delay_min ?? null,
          service_min: execution?.service_min ?? null,
          occurrence_type: final?.type === 'failed' ? (final.occurrence_type ?? 'other') : null,
          notes: final?.notes ?? null,
        };
      }),
      path: pings
        .filter((_, index) => index % passo === 0 || index === pings.length - 1)
        .map((ping) => ({
          latitude: ping.latitude,
          longitude: ping.longitude,
          recorded_at: toIso(ping.recorded_at),
        })),
    };
  }

  // ------------------------------------------------------------------ apoio

  private async load(query: FindAnalyticsDto): Promise<Dataset> {
    const idCompany = this.tenantContext.getIdCompany();

    const company = await this.companyRepository.findOne({
      where: { id_company: idCompany },
      select: ['id_company', 'timezone'],
    });
    const timezone = company?.timezone ?? DEFAULT_TIMEZONE;

    const to = query.to ?? todayInTimeZone(timezone);
    const from = query.from ?? shiftDay(to, -(DEFAULT_PERIOD_DAYS - 1));
    if (from > to) {
      throw new BadRequestException('A data inicial deve ser anterior ou igual à data final');
    }

    const routes = await this.routeRepository.find({
      where: {
        id_company: idCompany,
        planned_date: Between(from, to) as unknown as Date,
        status: In(['active', 'completed']),
      },
      relations: ['driver'],
      order: { planned_date: 'DESC', route_id: 'DESC' },
    });

    if (routes.length === 0) {
      return { from, to, timezone, routes, orders: [], events: [], metrics: new Map() };
    }

    const routeIds = routes.map((route) => route.route_id);
    const [orders, events, storedMetrics] = await Promise.all([
      this.orderRepository.find({
        where: { route_id: In(routeIds), id_company: idCompany },
        relations: ['client'],
        order: { stop_sequence: 'ASC' },
      }),
      this.eventRepository.find({
        where: { route_id: In(routeIds), id_company: idCompany },
        order: { occurred_at: 'ASC' },
      }),
      this.metricsRepository.find({ where: { route_id: In(routeIds), id_company: idCompany } }),
    ]);

    const metrics = new Map(storedMetrics.map((item) => [item.route_id, item]));

    // Rota encerrada pelo escritório nunca passou pela consolidação do
    // aplicativo. Fazemos aqui, uma vez, para ela entrar nos indicadores.
    const semConsolidacao = routes
      .filter((route) => route.status === 'completed' && !metrics.has(route.route_id))
      .slice(0, MAX_LAZY_CONSOLIDATIONS);
    for (const route of semConsolidacao) {
      const saved = await this.routeMetricsService.consolidate(route.route_id, idCompany);
      if (saved) metrics.set(route.route_id, saved);
    }

    return { from, to, timezone, routes, orders, events, metrics };
  }

  private stopExecutionsByRoute(data: Dataset): Map<number, StopExecution[]> {
    return new Map(
      [...data.metrics.entries()].map(([routeId, item]) => [routeId, item.stops ?? []]),
    );
  }

  private stopExecutions(data: Dataset): StopExecution[] {
    return [...data.metrics.values()].flatMap((item) => item.stops ?? []);
  }
}
