import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Um ponto do rastro de GPS de uma rota em execução.
 *
 * É o dado bruto da "rota executada". Não é consultado ponto a ponto pela
 * operação: serve para a consolidação calcular distância percorrida e tempo
 * parado, e para desenhar o trajeto na comparação.
 */
@Entity('route_location_ping')
@Index(['id_company', 'client_ping_id'], { unique: true })
@Index(['route_id', 'recorded_at'])
export class RouteLocationPing {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * Empresa dona da linha. Sem valor padrao de proposito: o TenantContext e
   * quem preenche, e uma insercao que escape dele deve falhar em vez de
   * gravar silenciosamente numa empresa que talvez nem exista.
   */
  @Column({ type: 'int' })
  id_company: number;

  @Column({ type: 'int' })
  route_id: number;

  @Column({ type: 'float' })
  latitude: number;

  @Column({ type: 'float' })
  longitude: number;

  /** Raio de incerteza informado pelo aparelho. Pontos imprecisos são ignorados no cálculo de distância. */
  @Column({ type: 'float', nullable: true })
  accuracy_m?: number;

  @Column({ type: 'float', nullable: true })
  speed_mps?: number;

  /** Hora do aparelho em que o ponto foi lido. */
  @Column()
  recorded_at: Date;

  @CreateDateColumn()
  received_at!: Date;

  /** Identificador gerado no aparelho, para o reenvio de um lote não duplicar pontos. */
  @Column({ type: 'varchar', length: 64 })
  client_ping_id: string;
}
