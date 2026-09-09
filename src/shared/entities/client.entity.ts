import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { ClientStatus } from '../domain/enums';

@Entity('client')
export class Client {
  @PrimaryGeneratedColumn()
  client_id!: number;

  /**
   * Empresa dona da linha. Sem valor padrao de proposito: o TenantContext e
   * quem preenche, e uma insercao que escape dele deve falhar em vez de
   * gravar silenciosamente numa empresa que talvez nem exista.
   */
  @Column({ type: 'int' })
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

  /**
   * Coordenadas do endereço do cliente. É o endereço mais reaproveitado da
   * operação: a maioria dos pedidos entrega aqui, e resolver uma vez evita
   * geocodificar o mesmo lugar a cada roteirização.
   */
  @Column({ type: 'float', nullable: true })
  latitude?: number;

  @Column({ type: 'float', nullable: true })
  longitude?: number;

  /**
   * Endereço normalizado que gerou as coordenadas acima. Se o endereço for
   * editado, a chave deixa de bater e a coordenada é resolvida de novo — sem
   * isso a coordenada continuaria apontando para o endereço antigo.
   */
  @Column({ type: 'varchar', length: 400, nullable: true })
  geocoded_address?: string;

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
