import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';
import { Route } from '../../../shared/entities/route.entity';
import { Order } from '../../../shared/entities/order.entity';
import { Driver } from '../../../shared/entities/driver.entity';
import { Vehicle } from '../../../shared/entities/vehicle.entity';
import { RouteLocationPing } from '../../../shared/entities/route-location-ping.entity';
import { Company } from '../../../shared/entities/company.entity';
import { RouteEvent } from '../../../shared/entities/route-event.entity';
import { OptimizedRouteHistory } from '../../../shared/entities/optimized-route-history.entity';
import {
  FINAL_STOP_STATUSES,
  OrderStatus,
  RouteEventType,
  RouteStatus,
} from '../../../shared/domain/enums';
import { plannedArrivalsByOrder } from '../../../shared/domain/planned-arrivals';
import { todayInTimeZone } from '../../../shared/domain/timezone';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';
import { RoutesService } from '../../routes/services/routes.service';
import {
  CancelRouteDto,
  DeliverStopDto,
  DriverEventDto,
  FailStopDto,
} from '../dto/driver-event.dto';
import { LocationBatchDto } from '../dto/location-batch.dto';
import { RouteMetricsService } from '../../analytics/route-metrics.service';

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/** Linhas por INSERT ao gravar o rastro: mantém o comando abaixo do limite de parâmetros do SQLite. */
const PING_INSERT_CHUNK = 50;

/** Relógio do aparelho adiantado além disto é tratado como erro e trocado pela hora do servidor. */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Uma parada, do jeito que o aplicativo mostra. */
export interface DriverStopView {
  order_id: number;
  stop_sequence: number | null;
  status: string;
  title: string;
  description: string | null;
  invoice_number: string | null;
  quantity: number;
  urgency: string;
  delivery_window: string | null;
  client_name: string | null;
  client_phone: string | null;
  address: {
    street: string;
    number: string;
    complement: string | null;
    district: string;
    city: string;
    state: string;
    zipcode: string;
  };
  latitude: number | null;
  longitude: number | null;
  /** Chegada prevista pela otimização. */
  planned_arrival: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  occurrence_type: string | null;
  notes: string | null;
}

export interface DriverRouteView {
  route_id: number;
  status: string;
  planned_date: string | null;
  region: string | null;
  simulated: boolean;
  total_distance_m: number | null;
  total_duration_min: number | null;
  started_at: string | null;
  finished_at: string | null;
  vehicle: { vehicle_id: number; name: string; plate: string | null } | null;
  stops: DriverStopView[];
}

/**
 * O que o aplicativo do entregador enxerga e faz.
 *
 * Toda consulta parte do motorista do token: o aparelho nunca informa de
 * quem é a rota. Uma rota de outro motorista responde 404, e não 403, para
 * não confirmar que ela existe.
 */
@Injectable()
export class DriverRoutesService {
  private readonly logger = new Logger(DriverRoutesService.name);

  constructor(
    @InjectRepository(Route)
    private routeRepository: Repository<Route>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Driver)
    private driverRepository: Repository<Driver>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(RouteEvent)
    private eventRepository: Repository<RouteEvent>,
    @InjectRepository(OptimizedRouteHistory)
    private historyRepository: Repository<OptimizedRouteHistory>,
    @InjectRepository(RouteLocationPing)
    private pingRepository: Repository<RouteLocationPing>,
    private routesService: RoutesService,
    private routeMetricsService: RouteMetricsService,
    private dataSource: DataSource,
    private tenantContext: TenantContextService,
  ) {}

  async me() {
    const idCompany = this.tenantContext.getIdCompany();
    const user = this.tenantContext.getUser();

    const [driver, company] = await Promise.all([
      this.driverRepository.findOne({
        where: { driver_id: this.driverId(), id_company: idCompany },
      }),
      this.companyRepository.findOne({ where: { id_company: idCompany } }),
    ]);

    if (!driver) {
      throw new ForbiddenException('O motorista deste acesso não existe mais');
    }

    return {
      user: { id: user?.id, email: user?.email, name: user?.name },
      driver: {
        driver_id: driver.driver_id,
        name: driver.name,
        phone: driver.phone ?? null,
        status: driver.status,
      },
      company: {
        id_company: idCompany,
        name: company?.trade_name || company?.corporate_name || null,
        timezone: company?.timezone ?? DEFAULT_TIMEZONE,
      },
    };
  }

  /**
   * Rotas do dia. Uma rota em andamento aparece sempre, mesmo planejada para
   * outro dia: quem saiu ontem e ainda não encerrou precisa conseguir terminar.
   */
  async findRoutes(date?: string): Promise<DriverRouteView[]> {
    const idCompany = this.tenantContext.getIdCompany();
    const driverId = this.driverId();
    const dia = date ?? todayInTimeZone(await this.timezone());

    const routes = await this.routeRepository.find({
      where: [
        {
          id_company: idCompany,
          driver_id: driverId,
          planned_date: dia as unknown as Date,
          status: Not('cancelled'),
        },
        { id_company: idCompany, driver_id: driverId, status: 'active' },
      ],
      relations: ['vehicle'],
      order: { planned_date: 'ASC', route_id: 'ASC' },
    });

    return this.toViews(routes);
  }

  async findOne(routeId: number): Promise<DriverRouteView> {
    const route = await this.findOwnRoute(routeId);
    const [view] = await this.toViews([route]);
    return view;
  }

  /**
   * Saída para a rua. Se o escritório já iniciou a rota pelo sistema web, o
   * aplicativo apenas registra a saída do entregador, sem mexer na hora de
   * início que já estava gravada.
   */
  async start(routeId: number, dto: DriverEventDto): Promise<DriverRouteView> {
    if (await this.alreadyProcessed(dto.client_event_id)) {
      return this.findOne(routeId);
    }

    const route = await this.findOwnRoute(routeId);
    const occurredAt = this.occurredAt(dto);

    if (route.status === 'planned') {
      await this.routesService.start(routeId);
      await this.routeRepository.update({ route_id: routeId }, { started_at: occurredAt });
    } else if (route.status !== 'active') {
      throw new ConflictException(
        `Esta rota está como "${route.status}" e não pode mais ser iniciada`,
      );
    }

    await this.recordEvent(route, 'route_started', dto, occurredAt);
    return this.findOne(routeId);
  }

  /**
   * Chegada à parada. Não muda o pedido: marca a hora, que é o que permite
   * medir pontualidade e tempo de atendimento.
   */
  async arrive(routeId: number, orderId: number, dto: DriverEventDto): Promise<DriverRouteView> {
    if (await this.alreadyProcessed(dto.client_event_id)) {
      return this.findOne(routeId);
    }

    const route = await this.findOwnRoute(routeId);
    await this.findOpenStop(route, orderId);

    await this.recordEvent(route, 'arrived', dto, this.occurredAt(dto), { order_id: orderId });
    return this.findOne(routeId);
  }

  async deliver(routeId: number, orderId: number, dto: DeliverStopDto): Promise<DriverRouteView> {
    return this.closeStop(routeId, orderId, 'delivered', dto, { notes: dto.notes });
  }

  /** Parada visitada e não entregue. O motivo é obrigatório: é o dado que o painel analisa. */
  async fail(routeId: number, orderId: number, dto: FailStopDto): Promise<DriverRouteView> {
    return this.closeStop(routeId, orderId, 'failed', dto, {
      occurrence_type: dto.occurrence_type,
      notes: dto.notes,
    });
  }

  /**
   * Encerra a rota. Diferente do "concluir" do escritório, aqui nada é dado
   * como entregue por omissão: toda parada precisa de uma baixa ou de uma
   * ocorrência, senão o painel passaria a contar como entrega o que o
   * entregador apenas não registrou.
   */
  async finish(routeId: number, dto: DriverEventDto): Promise<DriverRouteView> {
    if (await this.alreadyProcessed(dto.client_event_id)) {
      return this.findOne(routeId);
    }

    const route = await this.findOwnRoute(routeId);
    const occurredAt = this.occurredAt(dto);

    if (route.status === 'active') {
      const orders = await this.orderRepository.find({
        where: { route_id: routeId, id_company: route.id_company },
        order: { stop_sequence: 'ASC' },
      });
      const abertas = orders.filter((order) => !FINAL_STOP_STATUSES.includes(order.status));

      if (abertas.length > 0) {
        throw new BadRequestException({
          message: `Ainda há ${abertas.length} parada(s) sem baixa. Registre a entrega ou a ocorrência de cada uma antes de encerrar.`,
          // No formato de `errors` que o filtro de exceções preserva na resposta.
          errors: abertas.map((order) => ({
            field: `order_${order.order_id}`,
            messages: [`Parada ${order.stop_sequence ?? '?'}: ${order.title}`],
          })),
        });
      }

      await this.dataSource.transaction(async (manager) => {
        await manager.update(
          Route,
          { route_id: routeId },
          {
            status: 'completed' as RouteStatus,
            finished_at: occurredAt,
            updated_by: this.tenantContext.getUser()?.email ?? undefined,
          },
        );
        if (route.driver_id) {
          await manager.update(Driver, { driver_id: route.driver_id }, { status: 'available' });
        }
        if (route.vehicle_id) {
          await manager.update(Vehicle, { vehicle_id: route.vehicle_id }, { status: 'available' });
        }
      });
    } else if (route.status !== 'completed') {
      // Rota já concluída passa direto: o escritório encerrou pelo sistema web
      // e o aplicativo só está registrando o fim do lado dele.
      throw new ConflictException(`Esta rota está como "${route.status}" e não pode ser encerrada`);
    }

    await this.recordEvent(route, 'route_finished', dto, occurredAt);
    await this.consolidate(route);
    return this.findOne(routeId);
  }

  /**
   * Cancela uma rota em andamento.
   *
   * Faz o mesmo que o "cancelar" do escritório: as paradas ainda abertas
   * voltam para a fila de pedidos, para serem roteirizadas de novo, e o
   * motorista e o veículo são liberados. O que já foi entregue ou teve
   * ocorrência continua registrado na rota. O motivo é obrigatório e fica
   * gravado no evento de cancelamento.
   */
  async cancel(routeId: number, dto: CancelRouteDto): Promise<DriverRouteView> {
    if (await this.alreadyProcessed(dto.client_event_id)) {
      return this.findOne(routeId);
    }

    const route = await this.findOwnRoute(routeId);
    const occurredAt = this.occurredAt(dto);

    if (route.status === 'active') {
      await this.routesService.cancel(routeId);
    } else if (route.status !== 'cancelled') {
      // Rota já cancelada passa direto: o escritório cancelou pelo sistema web
      // e o aplicativo só está registrando o lado dele.
      throw new ConflictException(
        `Esta rota está como "${route.status}". Só é possível cancelar uma rota em andamento.`,
      );
    }

    await this.recordEvent(route, 'route_cancelled', dto, occurredAt, { notes: dto.reason.trim() });
    return this.findOne(routeId);
  }

  /**
   * Recebe um lote do rastro de GPS.
   *
   * Aceita pontos de uma rota já encerrada: com a fila offline, é normal o
   * rastro chegar depois do encerramento. Nesse caso a comparação é refeita.
   */
  async recordLocations(routeId: number, dto: LocationBatchDto): Promise<{ accepted: number }> {
    const route = await this.findOwnRoute(routeId);

    if (route.status === 'planned' || route.status === 'cancelled') {
      throw new ConflictException(`Esta rota está como "${route.status}" e não recebe rastreamento`);
    }

    const rows = dto.points.map((point) => ({
      id_company: route.id_company,
      route_id: route.route_id,
      latitude: point.latitude,
      longitude: point.longitude,
      accuracy_m: point.accuracy_m,
      // Alguns aparelhos informam -1 quando não sabem a velocidade.
      speed_mps: point.speed_mps != null && point.speed_mps >= 0 ? point.speed_mps : undefined,
      recorded_at: this.occurredAt({ occurred_at: point.recorded_at }),
      client_ping_id: point.client_ping_id,
    }));

    for (let inicio = 0; inicio < rows.length; inicio += PING_INSERT_CHUNK) {
      await this.pingRepository
        .createQueryBuilder()
        .insert()
        .into(RouteLocationPing)
        .values(rows.slice(inicio, inicio + PING_INSERT_CHUNK))
        // Ponto reenviado bate no índice único e é ignorado.
        .orIgnore()
        .execute();
    }

    if (route.status === 'completed') {
      await this.consolidate(route);
    }

    return { accepted: rows.length };
  }

  private async closeStop(
    routeId: number,
    orderId: number,
    status: Extract<OrderStatus, 'delivered' | 'failed'>,
    dto: DriverEventDto,
    extra: Partial<RouteEvent>,
  ): Promise<DriverRouteView> {
    if (await this.alreadyProcessed(dto.client_event_id)) {
      return this.findOne(routeId);
    }

    const route = await this.findOwnRoute(routeId);
    await this.findOpenStop(route, orderId);
    const occurredAt = this.occurredAt(dto);

    await this.orderRepository.update(
      { order_id: orderId, id_company: route.id_company },
      {
        status,
        // A hora de entrega só faz sentido para o que foi entregue.
        delivered_at: status === 'delivered' ? occurredAt : undefined,
        updated_by: this.tenantContext.getUser()?.email ?? undefined,
      },
    );

    await this.recordEvent(route, status, dto, occurredAt, { order_id: orderId, ...extra });
    return this.findOne(routeId);
  }

  /** A parada precisa ser desta rota, com a rota em andamento e ainda sem baixa. */
  private async findOpenStop(route: Route, orderId: number): Promise<Order> {
    if (route.status !== 'active') {
      throw new ConflictException(
        `A rota está como "${route.status}". Só é possível registrar paradas com a rota em andamento.`,
      );
    }

    const order = await this.orderRepository.findOne({
      where: { order_id: orderId, route_id: route.route_id, id_company: route.id_company },
    });
    if (!order) {
      throw new NotFoundException(`Pedido ${orderId} não faz parte da rota ${route.route_id}`);
    }
    if (FINAL_STOP_STATUSES.includes(order.status)) {
      throw new ConflictException('Esta parada já foi encerrada');
    }
    return order;
  }

  /** A consolidação nunca derruba a ação do entregador: se falhar, o painel refaz depois. */
  private async consolidate(route: Route): Promise<void> {
    try {
      await this.routeMetricsService.consolidate(route.route_id, route.id_company);
    } catch (error) {
      this.logger.error(`Falha ao consolidar a rota ${route.route_id}`, error as Error);
    }
  }

  // ------------------------------------------------------------------ apoio

  protected driverId(): number {
    const driverId = this.tenantContext.getUser()?.driver_id;
    if (!driverId) {
      throw new ForbiddenException('Este usuário não está vinculado a um motorista');
    }
    return driverId;
  }

  protected async findOwnRoute(routeId: number): Promise<Route> {
    const route = await this.routeRepository.findOne({
      where: {
        route_id: routeId,
        id_company: this.tenantContext.getIdCompany(),
        driver_id: this.driverId(),
      },
      relations: ['vehicle'],
    });

    if (!route) {
      throw new NotFoundException(`Rota ${routeId} não encontrada`);
    }
    return route;
  }

  protected async alreadyProcessed(clientEventId: string): Promise<boolean> {
    const existing = await this.eventRepository.findOne({
      where: { id_company: this.tenantContext.getIdCompany(), client_event_id: clientEventId },
      select: ['id'],
    });
    return !!existing;
  }

  protected occurredAt(dto: { occurred_at: string }): Date {
    const informado = new Date(dto.occurred_at);
    const agora = Date.now();
    if (Number.isNaN(informado.getTime()) || informado.getTime() > agora + MAX_CLOCK_SKEW_MS) {
      return new Date(agora);
    }
    return informado;
  }

  protected async recordEvent(
    route: Route,
    type: RouteEventType,
    dto: DriverEventDto,
    occurredAt: Date,
    extra: Partial<RouteEvent> = {},
  ): Promise<void> {
    try {
      await this.eventRepository.save(
        this.eventRepository.create({
          id_company: route.id_company,
          route_id: route.route_id,
          driver_id: route.driver_id ?? undefined,
          type,
          latitude: dto.latitude,
          longitude: dto.longitude,
          accuracy_m: dto.accuracy_m,
          occurred_at: occurredAt,
          client_event_id: dto.client_event_id,
          ...extra,
        }),
      );
    } catch (error) {
      // Duas cópias do mesmo envio chegando juntas: a segunda bate no índice
      // único. O fato já está gravado, então não há o que reportar.
      if (await this.alreadyProcessed(dto.client_event_id)) {
        this.logger.warn(`Evento ${dto.client_event_id} recebido em duplicidade`);
        return;
      }
      throw error;
    }
  }

  protected async timezone(): Promise<string> {
    const company = await this.companyRepository.findOne({
      where: { id_company: this.tenantContext.getIdCompany() },
      select: ['id_company', 'timezone'],
    });
    return company?.timezone ?? DEFAULT_TIMEZONE;
  }

  /**
   * Monta a visão do aplicativo para várias rotas com um número fixo de
   * consultas (pedidos, eventos e históricos), independente de quantas
   * rotas ou paradas existam.
   */
  protected async toViews(routes: Route[]): Promise<DriverRouteView[]> {
    if (routes.length === 0) return [];

    const idCompany = this.tenantContext.getIdCompany();
    const routeIds = routes.map((route) => route.route_id);
    const historyIds = [
      ...new Set(routes.map((route) => route.history_id).filter((id): id is number => !!id)),
    ];

    const [orders, events, histories] = await Promise.all([
      this.orderRepository.find({
        where: { route_id: In(routeIds), id_company: idCompany },
        relations: ['client'],
        order: { stop_sequence: 'ASC' },
      }),
      this.eventRepository.find({
        where: { route_id: In(routeIds), id_company: idCompany },
        order: { occurred_at: 'ASC' },
      }),
      historyIds.length
        ? this.historyRepository.find({
            where: { id: In(historyIds), id_company: idCompany },
            select: ['id', 'optimization_result'],
          })
        : Promise.resolve([] as OptimizedRouteHistory[]),
    ]);

    const plannedArrival = plannedArrivalsByOrder(histories);

    const eventsByOrder = new Map<number, RouteEvent[]>();
    for (const event of events) {
      if (!event.order_id) continue;
      const lista = eventsByOrder.get(event.order_id) ?? [];
      lista.push(event);
      eventsByOrder.set(event.order_id, lista);
    }

    return routes.map((route) => ({
      route_id: route.route_id,
      status: route.status,
      planned_date: route.planned_date ? String(route.planned_date).slice(0, 10) : null,
      region: route.region ?? null,
      simulated: !!route.simulated,
      total_distance_m: route.total_distance_m ?? null,
      total_duration_min: route.total_duration_min ?? null,
      started_at: toIso(route.started_at),
      finished_at: toIso(route.finished_at),
      vehicle: route.vehicle
        ? {
            vehicle_id: route.vehicle.vehicle_id,
            name: route.vehicle.name,
            plate: route.vehicle.plate ?? null,
          }
        : null,
      stops: orders
        .filter((order) => order.route_id === route.route_id)
        .map((order) => toStopView(order, eventsByOrder.get(order.order_id) ?? [], plannedArrival)),
    }));
  }
}

function toStopView(
  order: Order,
  events: RouteEvent[],
  plannedArrival: Map<number, string>,
): DriverStopView {
  const arrived = events.find((event) => event.type === 'arrived');
  const final = [...events]
    .reverse()
    .find((event) => event.type === 'delivered' || event.type === 'failed');

  return {
    order_id: order.order_id,
    stop_sequence: order.stop_sequence ?? null,
    status: order.status,
    title: order.title,
    description: order.description ?? null,
    invoice_number: order.invoice_number ?? null,
    quantity: order.quantity,
    urgency: order.urgency,
    delivery_window: order.delivery_window ?? null,
    client_name: order.client?.trade_name || order.client?.name || null,
    client_phone: order.client?.phone ?? null,
    address: {
      street: order.delivery_street,
      number: order.delivery_number,
      complement: order.delivery_complement ?? null,
      district: order.delivery_district,
      city: order.delivery_city,
      state: order.delivery_state,
      zipcode: order.delivery_zipcode,
    },
    latitude: order.delivery_latitude ?? null,
    longitude: order.delivery_longitude ?? null,
    planned_arrival: plannedArrival.get(order.order_id) ?? null,
    arrived_at: toIso(arrived?.occurred_at),
    completed_at: toIso(final?.occurred_at ?? order.delivered_at),
    occurrence_type: final?.occurrence_type ?? null,
    notes: final?.notes ?? null,
  };
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
