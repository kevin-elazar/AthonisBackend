import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';

@Entity('street_view_cache')
export class StreetViewCache {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', unique: true })
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

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  capture_date: string; // Formato: 'YYYY-MM' retornado pelo Google

  @Column({ type: 'text', nullable: true })
  image_url: string;

  @CreateDateColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @UpdateDateColumn({ 
    type: 'datetime', 
    default: () => 'CURRENT_TIMESTAMP', 
    onUpdate: 'CURRENT_TIMESTAMP' 
  })
  updated_at: Date;
}

