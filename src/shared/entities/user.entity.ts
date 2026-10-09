import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../domain/enums';

@Entity('user')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  password: string; // Hash bcrypt

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 50, default: 'user' })
  role: UserRole;

  /**
   * Empresa dona da linha. Sem valor padrao de proposito: o TenantContext e
   * quem preenche, e uma insercao que escape dele deve falhar em vez de
   * gravar silenciosamente numa empresa que talvez nem exista.
   */
  @Column({ type: 'int' })
  id_company: number;

  /**
   * Motorista a que este login pertence. Só é preenchido para o papel
   * 'driver': é por aqui que o aplicativo descobre de quem são as rotas, sem
   * que o aparelho precise (ou possa) informar isso.
   */
  @Column({ type: 'int', nullable: true })
  driver_id?: number | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updated_at!: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  updated_by?: string;

  @Column({ type: 'datetime', nullable: true })
  last_login?: Date;
}

