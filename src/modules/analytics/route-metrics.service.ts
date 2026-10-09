import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Route } from '../../shared/entities/route.entity';
import { Order } from '../../shared/entities/order.entity';
import { RouteEvent } from '../../shared/entities/route-event.entity';
import { RouteLocationPing } from '../../shared/entities/route-location-ping.entity';
import { RouteExecutionMetrics } from '../../shared/entities/route-execution-metrics.entity';
import { OptimizedRouteHistory } from '../../shared/entities/optimized-route-history.entity';
import { plannedArrivalsByOrder } from '../../shared/domain/planned-arrivals';
import { computeRouteMetrics, MetricsResult } from './route-metrics.calculator';

const toDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Consolida a execução de uma rota em `route_execution_metrics`.
 *
 * Recebe a empresa por parâmetro em vez de ler o contexto da requisição:
 * a mesma conta é disparada pelo aplicativo (ao encerrar a rota) e pelo
 * painel (para rotas encerradas pelo escritório, que nunca passaram por aqui).
 */
@Injectable()
export class RouteMetricsService {
  private readonly logger = new Logger(RouteMetricsService.name);

  constructor(
    @InjectRepository(Route)
    private routeRepository: Repository<Route>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(RouteEvent)
    private eventRepository: Repository<RouteEvent>,
    @InjectRepository(RouteLocationPing)
    private pingRepository: Repository<RouteLocationPing>,
    @InjectRepository(RouteExecutionMetrics)
    private metricsRepository: Repository<RouteExecutionMetrics>,
    @InjectRepository(OptimizedRouteHistory)
    private historyRepository: Repository<OptimizedRouteHistory>,
  ) {}

  /** Calcula sem gravar. Devolve null se a rota não existir na empresa. */
  async compute(routeId: number, idCompany: number): Promise<MetricsResult | null> {
    const route = await this.routeRepository.findOne({
      where: { route_id: routeId, id_company: idCompany },
    });
    if (!route) return null;

    const [orders, events, pings, history] = await Promise.all([
      this.orderRepository.find({
        where: { route_id: routeId, id_company: idCompany },
        order: { stop_sequence: 'ASC' },
      }),
      this.eventRepository.find({ where: { route_id: routeId, id_company: idCompany } }),
      this.pingRepository.find({
        where: { route_id: routeId, id_company: idCompany },
        select: ['latitude', 'longitude', 'accuracy_m', 'recorded_at'],
        order: { recorded_at: 'ASC' },
      }),
      route.history_id
        ? this.historyRepository.findOne({
            where: { id: route.history_id, id_company: idCompany },
            select: ['id', 'optimization_result'],
          })
        : Promise.resolve(null),
    ]);

    const plannedArrival = plannedArrivalsByOrder(history ? [history] : []);

    return computeRouteMetrics({
      planned_distance_m: route.total_distance_m ?? null,
      planned_duration_min: route.total_duration_min ?? null,
      started_at: toDate(route.started_at),
      finished_at: toDate(route.finished_at),
      simulated: !!route.simulated,
      stops: orders.map((order) => ({
        order_id: order.order_id,
        status: order.status,
        planned_sequence: order.stop_sequence ?? null,
        planned_arrival: plannedArrival.get(order.order_id) ?? null,
      })),
      events: events.map((event) => ({
        order_id: event.order_id,
        type: event.type,
        occurred_at: toDate(event.occurred_at) ?? new Date(0),
        occurrence_type: event.occurrence_type,
      })),
      pings: pings.map((ping) => ({
        latitude: ping.latitude,
        longitude: ping.longitude,
        accuracy_m: ping.accuracy_m,
        recorded_at: toDate(ping.recorded_at) ?? new Date(0),
      })),
    });
  }

  /** Calcula e grava, substituindo a consolidação anterior da rota. */
  async consolidate(routeId: number, idCompany: number): Promise<RouteExecutionMetrics | null> {
    const result = await this.compute(routeId, idCompany);
    if (!result) return null;

    const route = await this.routeRepository.findOne({
      where: { route_id: routeId, id_company: idCompany },
      select: ['route_id', 'driver_id'],
    });
    const existing = await this.metricsRepository.findOne({
      where: { route_id: routeId, id_company: idCompany },
    });

    const saved = await this.metricsRepository.save(
      this.metricsRepository.create({
        ...(existing ? { id: existing.id } : {}),
        id_company: idCompany,
        route_id: routeId,
        driver_id: route?.driver_id ?? undefined,
        planned_distance_m: result.planned_distance_m ?? undefined,
        actual_distance_m: result.actual_distance_m ?? undefined,
        planned_duration_min: result.planned_duration_min ?? undefined,
        actual_duration_min: result.actual_duration_min ?? undefined,
        stops_total: result.stops_total,
        stops_delivered: result.stops_delivered,
        stops_failed: result.stops_failed,
        stops_out_of_order: result.stops_out_of_order,
        idle_time_min: result.idle_time_min ?? undefined,
        avg_service_min: result.avg_service_min ?? undefined,
        avg_delay_min: result.avg_delay_min ?? undefined,
        ping_count: result.ping_count,
        stops: result.stops,
        computed_at: new Date(),
      }),
    );

    this.logger.log(
      `Rota ${routeId} consolidada: ${result.stops_delivered}/${result.stops_total} entregues, ` +
        `${result.ping_count} pontos de GPS`,
    );
    return saved;
  }
}
