import { DATETIME_TYPE, decimalTransformer } from '../../database/column-types';
import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * A empresa (tenant) do sistema.
 *
 * Antes, `id_company` era um inteiro solto em cada tabela, sem cadastro
 * nenhum: não havia endereço de depósito (a otimização partia de um ponto
 * fixo em São Paulo para todo mundo), nem custo operacional configurável,
 * nem nome próprio na interface.
 *
 * A chave primária NÃO é autoincremento de propósito: criar uma empresa nova
 * é uma operação de banco (ver `scripts/create-company.js`), feita por quem
 * administra o sistema. Pela API só é possível ler e editar a própria empresa.
 */
@Entity('company')
export class Company {
  @PrimaryColumn({ type: 'int' })
  id_company: number;

  // ---------------------------------------------------------- Identificação

  /** Razão social. */
  @Column({ type: 'varchar', length: 150 })
  corporate_name: string;

  /** Nome fantasia — é o que aparece na interface. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  trade_name?: string;

  /** CNPJ, apenas dígitos. */
  @Column({ type: 'varchar', length: 18 })
  document: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  state_registration?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  municipal_registration?: string;

  // --------------------------------------------------------------- Contato

  @Column({ type: 'varchar', length: 100, nullable: true })
  email?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone?: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  website?: string;

  // ------------------------------------------- Depósito (origem das rotas)

  @Column({ type: 'varchar', length: 100, nullable: true })
  depot_street?: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  depot_number?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  depot_complement?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  depot_district?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  depot_city?: string;

  @Column({ type: 'varchar', length: 2, nullable: true })
  depot_state?: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  depot_zip_code?: string;

  /**
   * Coordenadas do depósito. É daqui que toda rota parte e para onde volta —
   * o campo que substitui as coordenadas fixas da Praça da Sé no código.
   */
  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: decimalTransformer, nullable: true })
  depot_latitude?: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: decimalTransformer, nullable: true })
  depot_longitude?: number;

  /**
   * Endereço normalizado que gerou as coordenadas acima.
   *
   * Guardar isto é o que impede a coordenada ficar para trás: se o endereço do
   * depósito mudar, a chave deixa de bater e a coordenada é resolvida de novo.
   * Sem isso já aconteceu de o endereço apontar para uma cidade e a coordenada
   * para outra, a centenas de quilômetros, sem nada avisando.
   */
  @Column({ type: 'varchar', length: 400, nullable: true })
  depot_geocoded_address?: string;

  // ------------------------------------------- Parâmetros de roteirização

  /** Custo por quilômetro rodado, usado na otimização. */
  @Column({ type: 'decimal', precision: 10, scale: 2, transformer: decimalTransformer, default: 1.0 })
  cost_per_km: number;

  /** Custo por hora de operação, usado na otimização. */
  @Column({ type: 'decimal', precision: 10, scale: 2, transformer: decimalTransformer, default: 50.0 })
  cost_per_hour: number;

  /** Tempo médio parado em cada entrega, em minutos. */
  @Column({ type: 'int', default: 30 })
  stop_duration_minutes: number;

  /** Capacidade assumida quando o veículo não tem capacidade cadastrada. */
  @Column({ type: 'int', default: 1000 })
  default_vehicle_capacity_kg: number;

  /** Início e fim da janela operacional padrão (HH:mm). */
  @Column({ type: 'varchar', length: 5, nullable: true })
  operation_start_time?: string;

  @Column({ type: 'varchar', length: 5, nullable: true })
  operation_end_time?: string;

  // ------------------------------------------------------------- Interface

  /** URL do logotipo exibido no topo da aplicação. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  logo_url?: string;

  @Column({ type: 'varchar', length: 40, default: 'America/Sao_Paulo' })
  timezone: string;

  // -------------------------------------------------------------- Controle

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn({ type: DATETIME_TYPE, default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  created_by?: string;

  @CreateDateColumn({
    type: DATETIME_TYPE,
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at!: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  updated_by?: string;
}
