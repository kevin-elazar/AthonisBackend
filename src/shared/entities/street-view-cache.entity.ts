import { DATETIME_TYPE, decimalTransformer } from '../../database/column-types';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Order } from './order.entity';

@Entity('street_view_cache')
@Unique(['id_company', 'order_id'])
export class StreetViewCache {
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
  order_id: number;

  @OneToOne(() => Order)
  @JoinColumn({ name: 'order_id', referencedColumnName: 'order_id' })
  order: Order;

  @Column({ type: 'varchar', length: 500 })
  address: string;

  @Column({ type: 'varchar', length: 50 })
  status: string; // 'OK', 'ZERO_RESULTS', 'NOT_FOUND', 'REQUEST_DENIED', 'UNKNOWN_ERROR'

  @Column({ type: 'varchar', length: 100, nullable: true })
  pano_id: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: decimalTransformer, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: decimalTransformer, nullable: true })
  longitude: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  capture_date: string; // Formato: 'YYYY-MM' retornado pelo Google

  @Column({ type: 'text', nullable: true })
  image_url: string;

  @CreateDateColumn({ type: DATETIME_TYPE, default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: DATETIME_TYPE, default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updated_at!: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  updated_by?: string;
}

