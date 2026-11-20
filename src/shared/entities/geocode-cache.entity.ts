import { DATETIME_TYPE } from '../../database/column-types';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Coordenadas já resolvidas, guardadas por endereço.
 *
 * Sem isso, cada roteirização geocodifica de novo os mesmos endereços: o custo
 * passa a ser "pedidos × execuções" em vez de "endereços distintos".
 *
 * Esta é a única tabela sem `id_company` de propósito. A coordenada de um
 * endereço é um fato geográfico público, igual para qualquer empresa, e
 * separar por tenant faria a mesma consulta ser paga uma vez por empresa.
 * Não há dado de cliente aqui — só endereço e ponto no mapa.
 */
@Entity('geocode_cache')
export class GeocodeCache {
  @PrimaryGeneratedColumn()
  id: number;

  /** Endereço normalizado. Ver `shared/domain/address-key.ts`. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 400 })
  address_key: string;

  /** Endereço como o provedor devolveu, útil para conferir o que casou. */
  @Column({ type: 'varchar', length: 400, nullable: true })
  formatted_address?: string;

  @Column({ type: 'float' })
  latitude: number;

  @Column({ type: 'float' })
  longitude: number;

  /**
   * Quem resolveu. Coordenada simulada nunca entra aqui: cachear estimativa
   * envenenaria o cache justamente quando a chave real fosse ligada.
   */
  @Column({ type: 'varchar', length: 20, default: 'google' })
  provider: string;

  /** Quantas vezes o cache evitou uma consulta paga. */
  @Column({ type: 'int', default: 0 })
  hits: number;

  @CreateDateColumn({ type: DATETIME_TYPE, default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;

  @UpdateDateColumn({ type: DATETIME_TYPE, default: () => 'CURRENT_TIMESTAMP' })
  updated_at!: Date;
}
