import { DATETIME_TYPE } from "../../database/column-types";
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Parada que ainda estava em aberto quando a rota foi cancelada.
 *
 * Cancelar devolve esses pedidos para a fila, e o pedido deixa de apontar
 * para a rota. Sem este registro não haveria como saber, depois, quais
 * paradas a rota cancelada ainda devia — e é isso que permite duplicá-la
 * para tentar a entrega de novo, na mesma ordem.
 */
@Entity('route_returned_stop')
@Index(['route_id'])
export class RouteReturnedStop {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * Empresa dona da linha. Sem valor padrao de proposito: o TenantContext e
   * quem preenche, e uma insercao que escape dele deve falhar em vez de
   * gravar silenciosamente numa empresa que talvez nem exista.
   */
  @Column({ type: 'int' })
  id_company: number;

  /** Rota cancelada. */
  @Column({ type: 'int' })
  route_id: number;

  @Column({ type: 'int' })
  order_id: number;

  /** Posição que a parada tinha na rota cancelada. */
  @Column({ type: 'int', nullable: true })
  stop_sequence?: number;

  @CreateDateColumn({ type: DATETIME_TYPE })
  created_at!: Date;
}
