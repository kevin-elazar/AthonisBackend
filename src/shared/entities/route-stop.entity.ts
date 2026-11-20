import { DATETIME_TYPE } from '../../database/column-types';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Situação da parada numa rota. "returned" é a parada que ainda estava em
 * aberto quando a rota foi cancelada: o pedido voltou para a fila sem ter
 * sido visitado, e por isso não conta como tentativa de entrega.
 */
export const ROUTE_STOP_STATUSES = ['planned', 'in_route', 'delivered', 'failed', 'returned'] as const;
export type RouteStopStatus = (typeof ROUTE_STOP_STATUSES)[number];

/**
 * Uma passagem do pedido por uma rota: uma tentativa de entrega.
 *
 * Antes o pedido tinha só `route_id`. Um pedido não entregue ficava preso à
 * rota antiga e não podia ir para outra; e mover o `route_id` apagaria a
 * parada da rota anterior, levando junto a tentativa e as métricas dela.
 * Agora cada rota guarda as próprias paradas aqui, e o `route_id` do pedido
 * diz só em que rota ele está agora.
 */
@Entity('route_stop')
@Index(['route_id', 'order_id'], { unique: true })
@Index(['order_id'])
export class RouteStop {
  @PrimaryGeneratedColumn()
  id: number;

  /** Empresa dona da linha. Sem valor padrão de propósito, como nas outras tabelas. */
  @Column({ type: 'int' })
  id_company: number;

  @Column({ type: 'int' })
  route_id: number;

  @Column({ type: 'int' })
  order_id: number;

  /** Número da tentativa de entrega deste pedido: 1, 2, 3... */
  @Column({ type: 'int', default: 1 })
  attempt: number;

  /** Posição da parada na rota, a partir de 1. */
  @Column({ type: 'int', nullable: true })
  stop_sequence?: number | null;

  @Column({ type: 'varchar', length: 20, default: 'planned' })
  status: RouteStopStatus;

  /** Quando a parada foi resolvida (entregue ou não entregue). */
  @Column({ type: DATETIME_TYPE, nullable: true })
  completed_at?: Date | null;

  @CreateDateColumn({ type: DATETIME_TYPE })
  created_at!: Date;

  @UpdateDateColumn({ type: DATETIME_TYPE })
  updated_at!: Date;
}
