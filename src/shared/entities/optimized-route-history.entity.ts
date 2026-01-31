import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('optimized_route_history')
export class OptimizedRouteHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', default: 1000 })
  id_company: number;

  @CreateDateColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @UpdateDateColumn({ 
    type: 'datetime', 
    default: () => 'CURRENT_TIMESTAMP', 
    onUpdate: 'CURRENT_TIMESTAMP' 
  })
  updated_at: Date;

  @Column({ type: 'simple-array' })
  order_ids: number[];

  @Column({ type: 'int' })
  total_routes: number;

  @Column({ type: 'int' })
  total_orders: number;

  @Column({ type: 'int', nullable: true })
  optimization_time_ms: number;

  @Column({ type: 'text' })
  google_api_response: string; // JSON stringificado da resposta completa da API

  @Column({ type: 'text' })
  optimization_result: string; // JSON stringificado do resultado formatado (OptimizationResultDto)

  @Column({ type: 'varchar', length: 50, default: 'success' })
  status: string; // 'success', 'partial', 'failed'

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  created_by: string;
}

