import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { Route } from '../../../shared/entities/route.entity';
import { Order } from '../../../shared/entities/order.entity';
import { Driver } from '../../../shared/entities/driver.entity';
import { Vehicle } from '../../../shared/entities/vehicle.entity';
import { RouteEvent } from '../../../shared/entities/route-event.entity';
import { RouteReturnedStop } from '../../../shared/entities/route-returned-stop.entity';
import { Company } from '../../../shared/entities/company.entity';
import { todayInTimeZone } from '../../../shared/domain/timezone';
import { DuplicateRouteDto } from '../dto/duplicate-route.dto';
import { FINAL_STOP_STATUSES, RouteStatus } from '../../../shared/domain/enums';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';
import { FindRouteDto } from '../dto/find-route.dto';

/**
 * Uma parada como a tela de rotas a mostra: o pedido, mais o que o
 * entregador registrou ao encerrá-la no aplicativo.
 */
export type RouteStopOrder = Order & {
  /** Motivo da não entrega. Vazio para o que foi entregue ou ainda está em aberto. */
  occurrence_type?: string | null;
  /** Observação escrita pelo entregador na entrega ou na ocorrência. */
  driver_notes?: string | null;
  /** Hora, no aparelho, em que a parada foi encerrada. */
  closed_at?: Date | null;
};

/** Uma rota com os pedidos já na ordem das paradas. */
export type RouteWithStops = Route & {
  orders: RouteStopOrder[];
  /** Motivo informado pelo entregador ao cancelar a rota pelo aplicativo. */
  cancel_reason?: string | null;
  /**
   * Paradas que a rota cancelada ainda devia e que continuam livres na fila,
   * prontas para irem para uma rota duplicada. Zero nas outras situações.
   */
  returned_stop_count?: number;
};

@Injectable()
export class RoutesService {
  private readonly logger = new Logger(RoutesService.name);

  constructor(
    @InjectRepository(Route)
    private routeRepository: Repository<Route>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Driver)
    private driverRepository: Repository<Driver>,
    @InjectRepository(Vehicle)
    private vehicleRepository: Repository<Vehicle>,
    @InjectRepository(RouteEvent)
    private eventRepository: Repository<RouteEvent>,
    @InjectRepository(RouteReturnedStop)
    private returnedStopRepository: Repository<RouteReturnedStop>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    private dataSource: DataSource,
    private tenantContext: TenantContextService,
  ) {}

  async findAll(query: FindRouteDto = {}): Promise<RouteWithStops[]> {
    const idCompany = this.tenantContext.getIdCompany();

    const where: Record<string, unknown> = { id_company: idCompany };
    if (query.status) where.status = query.status;
    if (query.planned_date) where.planned_date = query.planned_date;

    const routes = await this.routeRepository.find({
      where,
      relations: ['driver', 'vehicle'],
      order: { created_at: 'DESC' },
    });

    return this.attachOrders(routes);
  }

  async findOne(routeId: number): Promise<RouteWithStops> {
    const idCompany = this.tenantContext.getIdCompany();

    const route = await this.routeRepository.findOne({
      where: { route_id: routeId, id_company: idCompany },
      relations: ['driver', 'vehicle'],
    });

    if (!route) {
      throw new NotFoundException(`Rota ${routeId} não encontrada`);
    }

    const [comPedidos] = await this.attachOrders([route]);
    return comPedidos;
  }

  /**
   * Uma consulta para todas as rotas, em vez de uma por rota: a listagem
   * carrega dezenas de rotas e uma consulta por linha derruba o tempo de
   * resposta sem que ninguém perceba de onde vem.
   */
  private async attachOrders(routes: Route[]): Promise<RouteWithStops[]> {
    if (routes.length === 0) return [];

    const idCompany = this.tenantContext.getIdCompany();
    const orders = await this.orderRepository.find({
      where: { route_id: In(routes.map((r) => r.route_id)), id_company: idCompany },
      relations: ['client'],
      order: { stop_sequence: 'ASC' },
    });

    // O que o entregador registrou ao encerrar cada parada. O pedido guarda só
    // "não entregue"; o motivo e a observação estão no evento.
    const encerramentos = await this.eventRepository.find({
      where: {
        route_id: In(routes.map((r) => r.route_id)),
        id_company: idCompany,
        type: In(['delivered', 'failed', 'route_cancelled']),
      },
      order: { occurred_at: 'ASC' },
    });
    const ultimoPorPedido = new Map<number, RouteEvent>();
    const motivoCancelamento = new Map<number, string | null>();
    for (const event of encerramentos) {
      if (event.type === 'route_cancelled') motivoCancelamento.set(event.route_id, event.notes ?? null);
      else if (event.order_id) ultimoPorPedido.set(event.order_id, event);
    }

    const porRota = new Map<number, RouteStopOrder[]>();
    for (const order of orders) {
      const event = ultimoPorPedido.get(order.order_id);
      const lista = porRota.get(order.route_id) ?? [];
      lista.push({
        ...order,
        occurrence_type: order.status === 'failed' ? (event?.occurrence_type ?? 'other') : null,
        driver_notes: event?.notes ?? null,
        closed_at: event?.occurred_at ?? order.delivered_at ?? null,
      });
      porRota.set(order.route_id, lista);
    }

    const disponiveis = await this.availableReturnedStops(
      routes.filter((route) => route.status === 'cancelled').map((route) => route.route_id),
    );

    return routes.map((route) => ({
      ...route,
      orders: porRota.get(route.route_id) ?? [],
      cancel_reason: motivoCancelamento.get(route.route_id) ?? null,
      returned_stop_count: disponiveis.filter((stop) => stop.route_id === route.route_id).length,
    })) as RouteWithStops[];
  }

  /** Sai para a rua: a rota e tudo que ela carrega passam a estar em trânsito. */
  async start(routeId: number): Promise<RouteWithStops> {
    const route = await this.findOne(routeId);

    if (route.status === 'active') {
      throw new BadRequestException('A rota já está em andamento');
    }
    if (route.status !== 'planned') {
      throw new BadRequestException(
        `Só é possível iniciar uma rota planejada. Esta está como "${route.status}".`,
      );
    }
    if (route.orders.length === 0) {
      throw new BadRequestException('A rota não tem pedidos');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        Route,
        { route_id: routeId },
        { status: 'active' as RouteStatus, started_at: new Date(), updated_by: this.autor() },
      );

      // Pedido entregue não volta para "em rota" se alguém iniciar de novo.
      await manager.update(
        Order,
        { route_id: routeId, status: In(['pending', 'planned']) },
        { status: 'in_route', updated_by: this.autor() },
      );

      if (route.driver_id) {
        await manager.update(Driver, { driver_id: route.driver_id }, { status: 'in_route' });
      }
      if (route.vehicle_id) {
        await manager.update(Vehicle, { vehicle_id: route.vehicle_id }, { status: 'in_use' });
      }
    });

    return this.findOne(routeId);
  }

  /**
   * Encerra a rota. Os pedidos que ainda não foram baixados individualmente
   * são dados como entregues — quem fecha a rota está afirmando que o dia
   * terminou.
   */
  async complete(routeId: number): Promise<RouteWithStops> {
    const route = await this.findOne(routeId);

    if (route.status === 'completed') {
      throw new BadRequestException('A rota já foi concluída');
    }
    if (route.status !== 'active') {
      throw new BadRequestException(
        `Só é possível concluir uma rota em andamento. Esta está como "${route.status}".`,
      );
    }

    const agora = new Date();

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        Route,
        { route_id: routeId },
        { status: 'completed' as RouteStatus, finished_at: agora, updated_by: this.autor() },
      );

      await manager.update(
        Order,
        { route_id: routeId, status: In(['pending', 'planned', 'in_route']) },
        { status: 'delivered', delivered_at: agora, updated_by: this.autor() },
      );

      await this.liberarRecursos(manager, route);
    });

    return this.findOne(routeId);
  }

  /**
   * Baixa de uma parada. É o que o aplicativo do entregador chama a cada
   * entrega concluída; a rota fecha sozinha quando a última parada é baixada.
   */
  async deliverStop(routeId: number, orderId: number): Promise<RouteWithStops> {
    const route = await this.findOne(routeId);

    if (route.status !== 'active') {
      throw new BadRequestException('A rota precisa estar em andamento para baixar uma parada');
    }

    const order = route.orders.find((item) => item.order_id === orderId);
    if (!order) {
      throw new NotFoundException(`Pedido ${orderId} não faz parte da rota ${routeId}`);
    }
    if (FINAL_STOP_STATUSES.includes(order.status)) {
      throw new BadRequestException('Esta parada já foi baixada');
    }

    const agora = new Date();
    // Parada com ocorrência também está resolvida: o entregador esteve lá.
    const restantes = route.orders.filter(
      (item) => item.order_id !== orderId && !FINAL_STOP_STATUSES.includes(item.status),
    );

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        Order,
        { order_id: orderId, id_company: this.tenantContext.getIdCompany() },
        { status: 'delivered', delivered_at: agora, updated_by: this.autor() },
      );

      // Última parada: a rota terminou, e deixar o motorista "em rota" depois
      // disso é o tipo de estado que trava a escala do dia seguinte.
      if (restantes.length === 0) {
        await manager.update(
          Route,
          { route_id: routeId },
          { status: 'completed' as RouteStatus, finished_at: agora, updated_by: this.autor() },
        );
        await this.liberarRecursos(manager, route);
      }
    });

    return this.findOne(routeId);
  }

  /**
   * Apaga a rota e devolve os pedidos para a fila.
   *
   * Antes isso apagava a execução inteira do histórico, levando junto as
   * outras rotas geradas na mesma otimização.
   */
  async remove(routeId: number): Promise<void> {
    const route = await this.findOne(routeId);

    if (route.status === 'active') {
      throw new BadRequestException(
        'A rota está em andamento. Conclua ou cancele antes de excluir.',
      );
    }

    // Entrega concluída é fato registrado. Apagar a rota deixaria esses
    // pedidos apontando para algo que não existe mais, e a entrega perderia
    // o contexto de quando e por qual rota aconteceu.
    if (route.orders.some((order) => FINAL_STOP_STATUSES.includes(order.status))) {
      throw new BadRequestException(
        'A rota já tem paradas baixadas e não pode ser excluída. Cancele-a para liberar os pedidos restantes.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await this.devolverPedidos(manager, routeId);
      await manager.delete(Route, { route_id: routeId });
    });
  }

  /** Cancela sem apagar: o registro da tentativa continua existindo. */
  async cancel(routeId: number): Promise<RouteWithStops> {
    const route = await this.findOne(routeId);

    if (route.status === 'completed') {
      throw new BadRequestException('Uma rota concluída não pode ser cancelada');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        Route,
        { route_id: routeId },
        { status: 'cancelled' as RouteStatus, updated_by: this.autor() },
      );

      // Antes de devolver: depois disso o pedido já não aponta para a rota,
      // e a lista do que ela ainda devia se perderia.
      const abertas = route.orders.filter((order) => !FINAL_STOP_STATUSES.includes(order.status));
      if (abertas.length > 0) {
        await manager.insert(
          RouteReturnedStop,
          abertas.map((order) => ({
            id_company: route.id_company,
            route_id: routeId,
            order_id: order.order_id,
            stop_sequence: order.stop_sequence ?? undefined,
          })),
        );
      }

      await this.devolverPedidos(manager, routeId);
      await this.liberarRecursos(manager, route);
    });

    return this.findOne(routeId);
  }

  /**
   * Cria uma rota nova com as paradas que a rota cancelada ainda devia, na
   * mesma ordem, para a entrega ser feita de novo.
   *
   * Entram só os pedidos que continuam livres na fila: o que já foi colocado
   * em outra rota, entregue ou cancelado nesse meio-tempo fica de fora. A rota
   * nova não herda a previsão de chegada da otimização (era para outro dia) e
   * só herda distância e duração se tiver exatamente as mesmas paradas.
   */
  async duplicate(routeId: number, dto: DuplicateRouteDto = {}): Promise<RouteWithStops> {
    const idCompany = this.tenantContext.getIdCompany();
    const original = await this.routeRepository.findOne({
      where: { route_id: routeId, id_company: idCompany },
    });
    if (!original) {
      throw new NotFoundException(`Rota ${routeId} não encontrada`);
    }
    if (original.status !== 'cancelled') {
      throw new BadRequestException('Só é possível duplicar uma rota cancelada');
    }

    const devolvidas = await this.returnedStopRepository.count({
      where: { route_id: routeId, id_company: idCompany },
    });
    const disponiveis = await this.availableReturnedStops([routeId]);

    if (disponiveis.length === 0) {
      throw new BadRequestException(
        devolvidas === 0
          ? 'Esta rota foi cancelada sem paradas em aberto, ou antes de o sistema guardar quais eram. Gere uma rota nova a partir dos pedidos.'
          : 'As paradas desta rota já foram colocadas em outra rota, entregues ou canceladas.',
      );
    }

    const driverId = dto.driver_id ?? original.driver_id ?? undefined;
    const vehicleId = dto.vehicle_id ?? original.vehicle_id ?? undefined;

    if (driverId && !(await this.driverRepository.exist({ where: { driver_id: driverId, id_company: idCompany } }))) {
      throw new BadRequestException(`Motorista ${driverId} não encontrado`);
    }
    if (vehicleId && !(await this.vehicleRepository.exist({ where: { vehicle_id: vehicleId, id_company: idCompany } }))) {
      throw new BadRequestException(`Veículo ${vehicleId} não encontrado`);
    }

    const company = await this.companyRepository.findOne({
      where: { id_company: idCompany },
      select: ['id_company', 'timezone'],
    });
    const plannedDate = dto.planned_date ?? todayInTimeZone(company?.timezone ?? 'America/Sao_Paulo');
    // Distância e duração planejadas só valem para o mesmo conjunto de paradas:
    // se a rota cancelada já tinha entregas, a nova é menor que ela.
    const baixadasNaOriginal = await this.orderRepository.count({
      where: { route_id: routeId, id_company: idCompany },
    });
    const mesmasParadas = baixadasNaOriginal === 0 && disponiveis.length === devolvidas;
    const autor = this.autor();

    const novaRotaId = await this.dataSource.transaction(async (manager) => {
      const nova = await manager.save(
        manager.create(Route, {
          id_company: idCompany,
          driver_id: driverId,
          vehicle_id: vehicleId,
          status: 'planned' as RouteStatus,
          planned_date: plannedDate as unknown as Date,
          total_distance_m: mesmasParadas ? original.total_distance_m : undefined,
          total_duration_min: mesmasParadas ? original.total_duration_min : undefined,
          simulated: original.simulated,
          region: original.region,
          duplicated_from_route_id: original.route_id,
          created_by: autor,
        }),
      );

      for (const [indice, stop] of disponiveis.entries()) {
        await manager.update(
          Order,
          { order_id: stop.order_id, id_company: idCompany },
          {
            route_id: nova.route_id,
            stop_sequence: indice + 1,
            status: 'planned',
            driver_id: driverId,
            vehicle_id: vehicleId,
            delivery_date: plannedDate as unknown as Date,
            updated_by: autor,
          },
        );
      }

      return nova.route_id;
    });

    this.logger.log(
      `Rota ${routeId} duplicada na rota ${novaRotaId} com ${disponiveis.length} parada(s)`,
    );
    return this.findOne(novaRotaId);
  }

  /**
   * Paradas devolvidas por rotas canceladas que ainda estão livres na fila
   * (pedido pendente e sem rota), na ordem que tinham na rota original.
   */
  private async availableReturnedStops(routeIds: number[]): Promise<RouteReturnedStop[]> {
    if (routeIds.length === 0) return [];
    const idCompany = this.tenantContext.getIdCompany();

    const devolvidas = await this.returnedStopRepository.find({
      where: { route_id: In(routeIds), id_company: idCompany },
      order: { route_id: 'ASC', stop_sequence: 'ASC' },
    });
    if (devolvidas.length === 0) return [];

    const livres = await this.orderRepository.find({
      where: {
        order_id: In(devolvidas.map((stop) => stop.order_id)),
        id_company: idCompany,
        status: 'pending',
        route_id: IsNull(),
      },
      select: ['order_id'],
    });
    const idsLivres = new Set(livres.map((order) => order.order_id));

    return devolvidas.filter((stop) => idsLivres.has(stop.order_id));
  }

  /**
   * Solta os pedidos da rota. Só os que ainda não foram entregues: uma entrega
   * concluída é fato, e apagar a rota não a desfaz.
   */
  private async devolverPedidos(manager: EntityManager, routeId: number) {
    await manager.update(
      Order,
      { route_id: routeId, status: In(['pending', 'planned', 'in_route']) },
      { route_id: null, stop_sequence: null, status: 'pending', updated_by: this.autor() },
    );
    // Os entregues perdem o vínculo de rota apenas se a rota deixar de existir;
    // aqui mantemos o histórico da entrega apontando para a rota.
  }

  private async liberarRecursos(manager: EntityManager, route: Route) {
    if (route.driver_id) {
      await manager.update(Driver, { driver_id: route.driver_id }, { status: 'available' });
    }
    if (route.vehicle_id) {
      await manager.update(Vehicle, { vehicle_id: route.vehicle_id }, { status: 'available' });
    }
  }

  private autor(): string | undefined {
    return this.tenantContext.getUser()?.email ?? undefined;
  }
}
