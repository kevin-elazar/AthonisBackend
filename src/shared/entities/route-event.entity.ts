import { DATETIME_TYPE } from "../../database/column-types";
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { OccurrenceType, RouteEventType } from '../domain/enums';

/**
 * Um fato registrado pelo entregador em campo: saída, chegada a uma parada,
 * entrega, ocorrência, encerramento.
 *
 * O pedido guarda só a situação atual; esta tabela guarda a história, com a
 * hora e a posição de cada passo. É dela que saem pontualidade, tempo de
 * atendimento e a ordem em que as paradas foram de fato visitadas.
 */
@Entity('route_event')
@Index(['id_company', 'client_event_id'], { unique: true })
@Index(['route_id', 'occurred_at'])
export class RouteEvent {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * Empresa dona da linha. Sem valor padrao de proposito: o TenantContext e
   * quem preenche, e uma insercao que escape dele deve falhar em vez de
   * gravar silenciosamente numa empresa que talvez nem exista.
   */
  @Column({ type: 'int' })
  id_company: number;

  @Column({ type: 'int' })
  route_id: number;

  /** Vazio nos eventos da rota inteira (saída e encerramento). */
  @Column({ type: 'int', nullable: true })
  order_id?: number;

  @Column({ type: 'int', nullable: true })
  driver_id?: number;

  @Column({ type: 'varchar', length: 20 })
  type: RouteEventType;

  /** Preenchido apenas em 'failed'. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  occurrence_type?: OccurrenceType;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'float', nullable: true })
  latitude?: number;

  @Column({ type: 'float', nullable: true })
  longitude?: number;

  @Column({ type: 'float', nullable: true })
  accuracy_m?: number;

  /**
   * Hora do aparelho, no momento do toque. É a hora que vale: o evento pode
   * ter ficado horas na fila offline antes de chegar aqui.
   */
  @Column({ type: DATETIME_TYPE })
  occurred_at: Date;

  /** Hora em que o servidor recebeu. A diferença para `occurred_at` mede o atraso de sincronização. */
  @CreateDateColumn({ type: DATETIME_TYPE })
  received_at!: Date;

  /**
   * Identificador gerado no aparelho. Reenviar o mesmo evento depois de uma
   * queda de sinal não cria um segundo registro.
   */
  @Column({ type: 'varchar', length: 64 })
  client_event_id: string;
}
