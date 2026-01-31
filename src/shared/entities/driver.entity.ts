import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('driver')
export class Driver {
  @PrimaryGeneratedColumn()
  driver_id: number;

  @Column({ type: 'int', default: 1000 })
  id_company: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: string;

  @Column({ type: 'date', nullable: true })
  birth_date: Date;

  @Column({ type: 'varchar', length: 14, nullable: true })
  document: string;
}
