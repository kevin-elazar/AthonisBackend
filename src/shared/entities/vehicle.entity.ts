import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { VehicleStatus, VehicleType } from '../domain/enums';

@Entity('vehicle')
export class Vehicle {
  @PrimaryGeneratedColumn()
  vehicle_id: number;

  @Column({ type: 'int', default: 1000 })
  id_company: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  brand: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  model: string;

  @Column({ type: 'int', nullable: true })
  year: number;

  /** Placa — identificação real do veículo na operação. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  plate?: string;

  @Column({ type: 'varchar', length: 20, default: 'van' })
  type: VehicleType;

  /** Capacidade em quilos: alimenta a restrição de carga da otimização. */
  @Column({ type: 'int', nullable: true })
  capacity_kg?: number;

  @Column({ type: 'varchar', length: 20, default: 'available' })
  status: VehicleStatus;

  /** Motorista habitual deste veículo. */
  @Column({ type: 'int', nullable: true })
  driver_id?: number;

  @CreateDateColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updated_at!: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  updated_by?: string;
}
