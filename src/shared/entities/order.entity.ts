import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  RelationId,
} from 'typeorm';
import { Client } from './client.entity';
import { OrderStatus, OrderUrgency } from '../domain/enums';
import { Driver } from './driver.entity';
import { Vehicle } from './vehicle.entity';
import { Route } from './route.entity';

@Entity('order')
export class Order {
  @PrimaryGeneratedColumn()
  order_id: number;

  /**
   * Empresa dona da linha. Sem valor padrao de proposito: o TenantContext e
   * quem preenche, e uma insercao que escape dele deve falhar em vez de
   * gravar silenciosamente numa empresa que talvez nem exista.
   */
  @Column({ type: 'int' })
  id_company: number;

  /**
   * Cliente é opcional: existe entrega avulsa, que entra na rota apenas pelo
   * endereço, sem estar amarrada a um cadastro de cliente.
   */
  @Column({ type: 'int', nullable: true })
  client_id?: number;

  @ManyToOne(() => Client, { nullable: true })
  @JoinColumn({ name: 'client_id', referencedColumnName: 'client_id' })
  client?: Client;

  @Column({ type: 'varchar', length: 100 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  invoice_number?: string;

  @Column({ type: 'varchar', length: 20 })
  urgency: OrderUrgency;

  /** Ciclo de vida da entrega. Antes não existia: um pedido criado e um
   *  entregue eram indistinguíveis. */
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: OrderStatus;

  /** Janela combinada com o cliente, ex.: "08:00 - 12:00". */
  @Column({ type: 'varchar', length: 30, nullable: true })
  delivery_window?: string;

  /** Valor da mercadoria/frete, usado nos indicadores do painel. */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  value?: number;

  /**
   * Rota em que o pedido foi colocado. É por aqui que se responde "em que
   * rota está este pedido" sem varrer o histórico de otimização.
   */
  @Column({ type: 'int', nullable: true })
  route_id?: number;

  @ManyToOne(() => Route, { nullable: true })
  @JoinColumn({ name: 'route_id', referencedColumnName: 'route_id' })
  route?: Route;

  /** Posição da parada dentro da rota, a partir de 1. */
  @Column({ type: 'int', nullable: true })
  stop_sequence?: number;

  /**
   * Coordenadas do endereço de entrega, resolvidas na roteirização.
   * Guardadas para que a rota (e o app do entregador) não precisem
   * geocodificar de novo o mesmo endereço a cada consulta.
   */
  @Column({ type: 'float', nullable: true })
  delivery_latitude?: number;

  @Column({ type: 'float', nullable: true })
  delivery_longitude?: number;

  /** Endereço normalizado que gerou as coordenadas de entrega. */
  @Column({ type: 'varchar', length: 400, nullable: true })
  delivery_geocoded_address?: string;

  /** Momento em que a entrega foi efetivamente concluída. */
  @Column({ type: 'datetime', nullable: true })
  delivered_at?: Date;

  @Column({ type: 'int', nullable: true })
  vehicle_id?: number;

  @ManyToOne(() => Vehicle, { nullable: true })
  @JoinColumn({ name: 'vehicle_id', referencedColumnName: 'vehicle_id' })
  vehicle?: Vehicle;

  @Column({ type: 'int', nullable: true })
  driver_id?: number;

  @ManyToOne(() => Driver, { nullable: true })
  @JoinColumn({ name: 'driver_id', referencedColumnName: 'driver_id' })
  driver?: Driver;

  @Column({ type: 'date', nullable: true })
  delivery_date?: Date;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'varchar', length: 100 })
  delivery_street: string;

  @Column({ type: 'varchar', length: 100 })
  delivery_district: string;

  @Column({ type: 'varchar', length: 100 })
  delivery_city: string;

  @Column({ type: 'varchar', length: 2 })
  delivery_state: string;

  @Column({ type: 'varchar', length: 10 })
  delivery_zipcode: string;

  @Column({ type: 'varchar', length: 10 })
  delivery_number: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  delivery_complement?: string;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  created_by?: string;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updated_at!: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  updated_by?: string;
}
