import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { CnhCategory, DriverStatus } from '../domain/enums';

@Entity('driver')
export class Driver {
  @PrimaryGeneratedColumn()
  driver_id: number;

  /**
   * Empresa dona da linha. Sem valor padrao de proposito: o TenantContext e
   * quem preenche, e uma insercao que escape dele deve falhar em vez de
   * gravar silenciosamente numa empresa que talvez nem exista.
   */
  @Column({ type: 'int' })
  id_company: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: string;

  @Column({ type: 'date', nullable: true })
  birth_date: Date;

  @Column({ type: 'varchar', length: 14, nullable: true })
  document: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone?: string;

  /** Número da CNH. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  cnh?: string;

  /**
   * Categoria da CNH. E o que determina qual veiculo o motorista pode dirigir:
   * escalar quem so tem B num caminhao e infracao, nao detalhe de cadastro.
   */
  @Column({ type: 'varchar', length: 2, nullable: true })
  cnh_category?: CnhCategory;

  /** Validade da CNH. Vencida, o motorista nao pode rodar. */
  @Column({ type: 'date', nullable: true })
  cnh_expiration?: Date;

  @Column({ type: 'varchar', length: 20, default: 'available' })
  status: DriverStatus;

  @CreateDateColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updated_at!: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  updated_by?: string;
}
