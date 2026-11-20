import { EntityManager, In, Not } from 'typeorm';
import { Order } from '../../shared/entities/order.entity';
import { Route } from '../../shared/entities/route.entity';
import { RouteEvent } from '../../shared/entities/route-event.entity';
import { RouteStop, type RouteStopStatus } from '../../shared/entities/route-stop.entity';
import type { OrderStatus } from '../../shared/domain/enums';

/**
 * Paradas por rota (`route_stop`): uma linha por passagem do pedido por uma
 * rota, ou seja, por tentativa de entrega.
 *
 * O pedido continua com `route_id` (a rota em que ele está agora) e com a
 * situação da tentativa atual. As telas de uma rota leem as paradas daqui,
 * para que um pedido não entregue que foi para outra rota continue aparecendo
 * na rota anterior, como não entregue.
 */

/** Pedido como parada de uma rota: os campos da rota vêm da `route_stop`. */
export type StopOrder = Order & { attempt: number };

const OPEN_STATUSES: RouteStopStatus[] = ['planned', 'in_route'];

function toStopStatus(status: OrderStatus): RouteStopStatus {
  if (status === 'delivered' || status === 'failed' || status === 'in_route') return status;
  return 'planned';
}

/**
 * Coloca pedidos numa rota, criando a tentativa de cada um. O número da
 * tentativa conta as passagens anteriores do pedido, menos as devolvidas por
 * cancelamento (que não chegaram a ser visitadas).
 */
export async function addRouteStops(
  manager: EntityManager,
  idCompany: number,
  routeId: number,
  stops: Array<{ orderId: number; sequence: number }>,
): Promise<void> {
  if (stops.length === 0) return;
  const orderIds = stops.map((stop) => stop.orderId);
  const anteriores = await manager.find(RouteStop, {
    where: { order_id: In(orderIds), id_company: idCompany, status: Not('returned') },
    select: ['order_id', 'route_id'],
  });
  const contagem = new Map<number, number>();
  for (const item of anteriores) {
    if (item.route_id === routeId) continue;
    contagem.set(item.order_id, (contagem.get(item.order_id) ?? 0) + 1);
  }

  for (const stop of stops) {
    await manager
      .createQueryBuilder()
      .insert()
      .into(RouteStop)
      .values({
        id_company: idCompany,
        route_id: routeId,
        order_id: stop.orderId,
        attempt: (contagem.get(stop.orderId) ?? 0) + 1,
        stop_sequence: stop.sequence,
        status: 'planned',
      })
      .orIgnore()
      .execute();
  }
}

/**
 * Copia para as paradas da rota a situação dos pedidos que ainda estão nela.
 * Chamar depois de mexer no status dos pedidos de uma rota, na mesma
 * transação. Com `returnOpen`, as paradas em aberto viram "returned"
 * (cancelamento): chamar antes de devolver os pedidos para a fila.
 */
export async function syncRouteStops(
  manager: EntityManager,
  routeId: number,
  options: { returnOpen?: boolean } = {},
): Promise<void> {
  const stops = await manager.find(RouteStop, {
    where: { route_id: routeId, status: Not('returned') },
  });
  if (stops.length === 0) return;

  const orders = await manager.find(Order, {
    where: { order_id: In(stops.map((stop) => stop.order_id)) },
    select: ['order_id', 'route_id', 'status', 'delivered_at'],
  });
  const porId = new Map(orders.map((order) => [order.order_id, order]));
  const agora = new Date();

  for (const stop of stops) {
    const order = porId.get(stop.order_id);
    // O pedido já foi para outra rota: esta parada guarda o que aconteceu aqui.
    if (!order || order.route_id !== routeId) continue;

    let status = toStopStatus(order.status);
    if (options.returnOpen && OPEN_STATUSES.includes(status)) status = 'returned';

    const final = status === 'delivered' || status === 'failed';
    const completedAt = final
      ? (stop.completed_at ?? (status === 'delivered' ? order.delivered_at : null) ?? agora)
      : null;

    if (status !== stop.status || String(completedAt ?? '') !== String(stop.completed_at ?? '')) {
      await manager.update(RouteStop, { id: stop.id }, { status, completed_at: completedAt });
    }
  }
}

/** Apaga as paradas de uma rota excluída (só rota sem nenhuma baixa pode ser excluída). */
export async function deleteRouteStops(manager: EntityManager, routeId: number): Promise<void> {
  await manager.delete(RouteStop, { route_id: routeId });
}

/**
 * Os pedidos de cada rota, como paradas daquela rota: `route_id`,
 * `stop_sequence`, `status` e `delivered_at` vêm da tentativa, não do pedido.
 * Paradas devolvidas por cancelamento ficam de fora, como antes (o pedido
 * voltou para a fila).
 */
export async function ordersOfRoutes(
  manager: EntityManager,
  idCompany: number,
  routeIds: number[],
  relations: string[] = [],
): Promise<StopOrder[]> {
  if (routeIds.length === 0) return [];
  const stops = await manager.find(RouteStop, {
    where: { route_id: In(routeIds), id_company: idCompany, status: Not('returned') },
    order: { route_id: 'ASC', stop_sequence: 'ASC' },
  });
  if (stops.length === 0) return [];

  const orders = await manager.find(Order, {
    where: { order_id: In([...new Set(stops.map((stop) => stop.order_id))]), id_company: idCompany },
    relations,
  });
  const porId = new Map(orders.map((order) => [order.order_id, order]));

  const result: StopOrder[] = [];
  for (const stop of stops) {
    const order = porId.get(stop.order_id);
    if (!order) continue;
    result.push(
      Object.assign(Object.create(Object.getPrototypeOf(order)) as Order, order, {
        route_id: stop.route_id,
        stop_sequence: stop.stop_sequence ?? undefined,
        status: stop.status as OrderStatus,
        delivered_at: stop.status === 'delivered' ? (stop.completed_at ?? order.delivered_at) : undefined,
        attempt: stop.attempt,
      }) as StopOrder,
    );
  }
  return result;
}

export interface AttemptSummary {
  /** Tentativas de entrega já feitas ou em curso (sem as devolvidas por cancelamento). */
  attempts: number;
  /** A última tentativa que não deu certo. */
  last_failure: {
    route_id: number;
    occurred_at: string | null;
    occurrence_type: string | null;
  } | null;
}

/** Contagem de tentativas e a última falha de cada pedido, para a lista de pedidos. */
export async function attemptSummaries(
  manager: EntityManager,
  idCompany: number,
  orderIds: number[],
): Promise<Map<number, AttemptSummary>> {
  const result = new Map<number, AttemptSummary>();
  if (orderIds.length === 0) return result;

  const [stops, falhas] = await Promise.all([
    manager.find(RouteStop, {
      where: { order_id: In(orderIds), id_company: idCompany, status: Not('returned') },
      select: ['order_id'],
    }),
    manager.find(RouteEvent, {
      where: { order_id: In(orderIds), id_company: idCompany, type: 'failed' },
      order: { occurred_at: 'ASC' },
    }),
  ]);
  for (const stop of stops) {
    const atual = result.get(stop.order_id) ?? { attempts: 0, last_failure: null };
    atual.attempts += 1;
    result.set(stop.order_id, atual);
  }
  for (const falha of falhas) {
    if (!falha.order_id) continue;
    const atual = result.get(falha.order_id) ?? { attempts: 0, last_failure: null };
    atual.last_failure = {
      route_id: falha.route_id,
      occurred_at: falha.occurred_at ? new Date(falha.occurred_at).toISOString() : null,
      occurrence_type: falha.occurrence_type ?? null,
    };
    result.set(falha.order_id, atual);
  }
  return result;
}

export interface OrderAttemptView {
  attempt: number | null;
  route_id: number;
  route_status: string;
  planned_date: string | null;
  driver_name: string | null;
  vehicle_plate: string | null;
  stop_sequence: number | null;
  /** planned, in_route, delivered, failed ou returned (rota cancelada antes da visita). */
  status: RouteStopStatus;
  arrived_at: string | null;
  completed_at: string | null;
  occurrence_type: string | null;
  notes: string | null;
}

/** Todas as passagens do pedido por rotas, da mais antiga para a mais recente. */
export async function orderAttempts(
  manager: EntityManager,
  idCompany: number,
  orderId: number,
): Promise<OrderAttemptView[]> {
  const stops = await manager.find(RouteStop, {
    where: { order_id: orderId, id_company: idCompany },
    order: { route_id: 'ASC' },
  });
  if (stops.length === 0) return [];

  const routeIds = stops.map((stop) => stop.route_id);
  const [routes, events] = await Promise.all([
    manager.find(Route, {
      where: { route_id: In(routeIds), id_company: idCompany },
      relations: ['driver', 'vehicle'],
    }),
    manager.find(RouteEvent, {
      where: { order_id: orderId, route_id: In(routeIds), id_company: idCompany },
      order: { occurred_at: 'ASC' },
    }),
  ]);
  const rotas = new Map(routes.map((route) => [route.route_id, route]));
  const iso = (value?: Date | string | null) => (value ? new Date(value).toISOString() : null);

  return stops.map((stop) => {
    const route = rotas.get(stop.route_id);
    const daRota = events.filter((event) => event.route_id === stop.route_id);
    const chegada = daRota.find((event) => event.type === 'arrived');
    const baixa = [...daRota].reverse().find((event) => event.type === 'delivered' || event.type === 'failed');
    return {
      attempt: stop.status === 'returned' ? null : stop.attempt,
      route_id: stop.route_id,
      route_status: route?.status ?? 'cancelled',
      planned_date: route?.planned_date ? String(route.planned_date).slice(0, 10) : null,
      driver_name: route?.driver?.name ?? null,
      vehicle_plate: route?.vehicle?.plate ?? route?.vehicle?.name ?? null,
      stop_sequence: stop.stop_sequence ?? null,
      status: stop.status,
      arrived_at: iso(chegada?.occurred_at),
      completed_at: iso(baixa?.occurred_at ?? stop.completed_at),
      occurrence_type: stop.status === 'failed' ? (baixa?.occurrence_type ?? 'other') : null,
      notes: baixa?.notes ?? null,
    };
  });
}
