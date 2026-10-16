import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { RouteStatus } from '../domain/enums';
import { Driver } from './driver.entity';
import { Vehicle } from './vehicle.entity';

/**
 * Uma rota de entrega.
 *
 * Antes a rota só existia como JSON dentro de `optimized_route_history`, e a
 * tela a recriava na leitura fatiando esse JSON. Isso deixava a rota sem
 * identidade: não dava para saber em que rota um pedido estava, nem marcar
 * uma rota como iniciada, nem apagar uma sem apagar as irmãs geradas na
 * mesma execução.
 *
 * O histórico continua sendo o registro de auditoria da chamada à API de
 * otimização. Esta tabela é o que a operação manipula.
 */
@Entity('route')
export class Route {
  @PrimaryGeneratedColumn()
  route_id: number;

  /**
   * Empresa dona da linha. Sem valor padrao de proposito: o TenantContext e
   * quem preenche, e uma insercao que escape dele deve falhar em vez de
   * gravar silenciosamente numa empresa que talvez nem exista.
   */
  @Column({ type: 'int' })
  id_company: number;

  /** Execução da otimização que originou a rota. Serve para auditoria. */
  @Column({ type: 'int', nullable: true })
  history_id?: number;

  @Column({ type: 'int', nullable: true })
  driver_id?: number;

  @ManyToOne(() => Driver, { nullable: true })
  @JoinColumn({ name: 'driver_id', referencedColumnName: 'driver_id' })
  driver?: Driver;

  @Column({ type: 'int', nullable: true })
  vehicle_id?: number;

  @ManyToOne(() => Vehicle, { nullable: true })
  @JoinColumn({ name: 'vehicle_id', referencedColumnName: 'vehicle_id' })
  vehicle?: Vehicle;

  @Column({ type: 'varchar', length: 20, default: 'planned' })
  status: RouteStatus;

  /** Dia para o qual a rota foi planejada, herdado dos pedidos. */
  @Column({ type: 'date', nullable: true })
  planned_date?: Date;

  @Column({ type: 'int', nullable: true })
  total_distance_m?: number;

  @Column({ type: 'int', nullable: true })
  total_duration_min?: number;

  /**
   * Verdadeiro quando a rota veio da simulação local, e não da API de
   * otimização. Distâncias e horários são estimativas: quem despacha precisa
   * saber disso sem ter de consultar o histórico.
   */
  @Column({ type: 'boolean', default: false })
  simulated: boolean;

  /** Rota cancelada da qual esta foi duplicada, para levar a entrega adiante. */
  @Column({ type: 'int', nullable: true })
  duplicated_from_route_id?: number;

  /** Região de referência, para a pessoa reconhecer a rota na lista. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  region?: string;

  @Column({ type: 'datetime', nullable: true })
  started_at?: Date;

  @Column({ type: 'datetime', nullable: true })
  finished_at?: Date;

  @CreateDateColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  created_by?: string;

  @CreateDateColumn({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at!: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  updated_by?: string;
}
