import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { ClientStatus } from '../domain/enums';

@Entity('client')
export class Client {
  @PrimaryGeneratedColumn()
  client_id!: number;

  @Column({ type: 'int', default: 1000 })
  id_company!: number;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  trade_name?: string;

  @Column({ type: 'varchar', length: 18 })
  document!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  state_registration?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  email?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone?: string;

  @Column({ type: 'varchar', length: 1 })
  type!: string; // 'F' for individual, 'J' for legal entity

  @Column({ type: 'date', nullable: true })
  birth_date?: Date;

  @Column({ type: 'varchar', length: 100 })
  street!: string;

  @Column({ type: 'varchar', length: 100 })
  neighborhood!: string;

  @Column({ type: 'varchar', length: 100 })
  city!: string;

  @Column({ type: 'varchar', length: 2 })
  state!: string;

  @Column({ type: 'varchar', length: 10 })
  zip_code!: string;

  @Column({ type: 'varchar', length: 10 })
  number!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  complement?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: ClientStatus;

  @CreateDateColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updated_at!: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  updated_by?: string;
}
