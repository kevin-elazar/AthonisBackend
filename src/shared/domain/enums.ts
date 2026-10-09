/**
 * Vocabulário único do domínio.
 *
 * Antes, urgência era texto livre e cada camada usava um termo diferente
 * ("urgente" no seed, "alta" no README, qualquer coisa via CSV). Aqui existe
 * uma definição só, usada pelas entidades, pelos DTOs e pelo front-end.
 */

export const ORDER_STATUSES = [
  'pending',
  'planned',
  'in_route',
  'delivered',
  'failed',
  'delayed',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_URGENCIES = ['low', 'normal', 'high', 'critical'] as const;
export type OrderUrgency = (typeof ORDER_URGENCIES)[number];

export const DRIVER_STATUSES = ['available', 'in_route', 'unavailable'] as const;
export type DriverStatus = (typeof DRIVER_STATUSES)[number];

export const VEHICLE_STATUSES = ['available', 'in_use', 'maintenance', 'inactive'] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const VEHICLE_TYPES = ['van', 'truck', 'motorcycle', 'utility'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

/**
 * Categorias de CNH que interessam a uma operacao de entrega.
 * A habilita moto; B a E formam uma escala: quem tem E dirige o que B dirige.
 * As combinacoes (AB..AE) somam a moto a uma das categorias de carga.
 */
export const CNH_CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'] as const;
export type CnhCategory = (typeof CNH_CATEGORIES)[number];

/**
 * Ciclo de vida de uma rota.
 * 'planned' nasce da otimizacao, 'active' e quando o motorista sai para a
 * entrega e 'completed' quando volta. 'cancelled' devolve os pedidos.
 */
export const ROUTE_STATUSES = ['planned', 'active', 'completed', 'cancelled'] as const;
export type RouteStatus = (typeof ROUTE_STATUSES)[number];

export const CLIENT_STATUSES = ['active', 'inactive'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

/**
 * 'driver' é o papel do aplicativo do entregador. Ele só enxerga as próprias
 * rotas: o DriverRestrictionGuard barra esse papel em todo endpoint que não
 * foi marcado explicitamente com @AllowDriver().
 */
export const USER_ROLES = ['admin', 'user', 'driver'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Papéis que o cadastro de usuário do escritório pode atribuir. */
export const OFFICE_ROLES = ['admin', 'user'] as const;
export type OfficeRole = (typeof OFFICE_ROLES)[number];

/**
 * O que o entregador registra em campo.
 * 'arrived' não muda o pedido: marca a chegada, que é o que permite medir
 * pontualidade e tempo de atendimento. 'delivered' e 'failed' encerram a parada.
 */
export const ROUTE_EVENT_TYPES = [
  'route_started',
  'arrived',
  'delivered',
  'failed',
  'route_finished',
] as const;
export type RouteEventType = (typeof ROUTE_EVENT_TYPES)[number];

/** Motivos de uma parada não entregue. */
export const OCCURRENCE_TYPES = [
  'customer_absent',
  'address_not_found',
  'refused',
  'damaged_goods',
  'closed_establishment',
  'access_restricted',
  'traffic',
  'other',
] as const;
export type OccurrenceType = (typeof OCCURRENCE_TYPES)[number];

/** Situações em que a parada não espera mais nenhuma ação do entregador. */
export const FINAL_STOP_STATUSES: readonly OrderStatus[] = ['delivered', 'failed'];

/**
 * Termos legados que já existem no banco e em planilhas de importação.
 * Traduzimos na entrada em vez de aceitar dois vocabulários no banco.
 */
const URGENCY_ALIASES: Record<string, OrderUrgency> = {
  baixa: 'low',
  low: 'low',
  normal: 'normal',
  media: 'normal',
  média: 'normal',
  alta: 'high',
  high: 'high',
  urgente: 'high',
  critica: 'critical',
  crítica: 'critical',
  critical: 'critical',
};

export function normalizeUrgency(value: unknown): OrderUrgency | null {
  if (typeof value !== 'string') return null;
  return URGENCY_ALIASES[value.trim().toLowerCase()] ?? null;
}
