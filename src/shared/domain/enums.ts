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

export const CLIENT_STATUSES = ['active', 'inactive'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const USER_ROLES = ['admin', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];

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
