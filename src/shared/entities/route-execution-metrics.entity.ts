import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

/** Planejado e executado de uma parada, lado a lado. */
export interface StopExecution {
  order_id: number;
  status: string;
  planned_sequence: number | null;
  /** Posição em que a parada foi de fato visitada, a partir de 1. */
  actual_sequence: number | null;
  planned_arrival: string | null;
  actual_arrival: string | null;
  completed_at: string | null;
  /** Positivo quando chegou depois do previsto. */
  delay_min: number | null;
  /** Da chegada até a entrega ou ocorrência. */
  service_min: number | null;
  occurrence_type: string | null;
}

/**
 * Comparação entre a rota planejada pela otimização e a rota executada.
 *
 * Calculada quando a rota é encerrada (e refeita se chegarem pontos de GPS
 * atrasados). Fica gravada porque o painel consulta dezenas de rotas de uma
 * vez, e refazer a conta sobre milhares de pontos a cada tela não escala.
 */
@Entity('route_execution_metrics')
export class RouteExecutionMetrics {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * Empresa dona da linha. Sem valor padrao de proposito: o TenantContext e
   * quem preenche, e uma insercao que escape dele deve falhar em vez de
   * gravar silenciosamente numa empresa que talvez nem exista.
   */
  @Column({ type: 'int' })
  id_company: number;

  @Index({ unique: true })
  @Column({ type: 'int' })
  route_id: number;

  @Column({ type: 'int', nullable: true })
  driver_id?: number;

  @Column({ type: 'int', nullable: true })
  planned_distance_m?: number;

  /** Vazio quando a rota foi executada sem rastro de GPS. */
  @Column({ type: 'int', nullable: true })
  actual_distance_m?: number;

  @Column({ type: 'int', nullable: true })
  planned_duration_min?: number;

  @Column({ type: 'int', nullable: true })
  actual_duration_min?: number;

  @Column({ type: 'int', default: 0 })
  stops_total: number;

  @Column({ type: 'int', default: 0 })
  stops_delivered: number;

  @Column({ type: 'int', default: 0 })
  stops_failed: number;

  /** Paradas visitadas em posição diferente da planejada. */
  @Column({ type: 'int', default: 0 })
  stops_out_of_order: number;

  /** Tempo parado fora de uma parada de entrega. */
  @Column({ type: 'int', nullable: true })
  idle_time_min?: number;

  @Column({ type: 'float', nullable: true })
  avg_service_min?: number;

  @Column({ type: 'float', nullable: true })
  avg_delay_min?: number;

  /** Pontos de GPS aproveitados no cálculo, depois de descartar os imprecisos. */
  @Column({ type: 'int', default: 0 })
  ping_count: number;

  @Column({ type: 'simple-json', nullable: true })
  stops?: StopExecution[];

  @Column()
  computed_at: Date;
}
