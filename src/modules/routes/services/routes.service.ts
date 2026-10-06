import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Route } from '../../../shared/entities/route.entity';
import { Order } from '../../../shared/entities/order.entity';
import { Driver } from '../../../shared/entities/driver.entity';
import { Vehicle } from '../../../shared/entities/vehicle.entity';
import { RouteStatus } from '../../../shared/domain/enums';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';
import { FindRouteDto } from '../dto/find-route.dto';

/** Uma rota com os pedidos já na ordem das paradas. */
export type RouteWithStops = Route & { orders: Order[] };

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

    const porRota = new Map<number, Order[]>();
    for (const order of orders) {
      const lista = porRota.get(order.route_id) ?? [];
      lista.push(order);
      porRota.set(order.route_id, lista);
    }

    return routes.map((route) => ({
      ...route,
      orders: porRota.get(route.route_id) ?? [],
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
    if (order.status === 'delivered') {
      throw new BadRequestException('Esta parada já foi baixada');
    }

    const agora = new Date();
    const restantes = route.orders.filter(
      (item) => item.order_id !== orderId && item.status !== 'delivered',
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
    if (route.orders.some((order) => order.status === 'delivered')) {
      throw new BadRequestException(
        'A rota já tem entregas concluídas e não pode ser excluída. Cancele-a para liberar os pedidos restantes.',
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
      await this.devolverPedidos(manager, routeId);
      await this.liberarRecursos(manager, route);
    });

    return this.findOne(routeId);
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
