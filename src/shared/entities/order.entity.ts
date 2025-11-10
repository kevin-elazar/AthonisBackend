import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('order')
export class Order {
  @PrimaryGeneratedColumn()
  order_id: number;

  @Column({ type: 'int' })
  client_id: number;

  @Column({ type: 'varchar', length: 100 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  invoice_number?: string;

  @Column({ type: 'varchar', length: 20 })
  urgency: string;

  @Column({ type: 'int', nullable: true })
  vehicle_id?: number;

  @Column({ type: 'int', nullable: true })
  driver_id?: number;

  //@Column({ type: 'date', nullable: true })
  //delivery_date?: Date;

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
/*
  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({ type: 'varchar', length: 50 })
  created_by: string;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updated_at: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  updated_by?: string;*/
}
