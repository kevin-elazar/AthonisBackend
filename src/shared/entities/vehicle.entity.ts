import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

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
}
