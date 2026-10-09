import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Sessão longa do aplicativo.
 *
 * O access token dura uma hora; uma rota dura o dia inteiro. O refresh token
 * é o que evita pedir a senha ao entregador no meio da rua. Guardamos apenas
 * o hash: quem ler o banco não consegue se passar por ninguém.
 */
@Entity('refresh_token')
export class RefreshToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  user_id: number;

  /** SHA-256 do token, em hexadecimal. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  token_hash: string;

  @Column()
  expires_at: Date;

  /**
   * Quando o token foi trocado por um novo. Um token trocado ainda vale por
   * uma janela curta: em rede ruim a resposta da troca pode se perder, e o
   * aparelho repete o pedido com o token antigo. Sem essa tolerância, um
   * túnel no caminho deslogaria o entregador.
   */
  @Column({ nullable: true })
  replaced_at?: Date;

  /** Logout ou revogação pelo escritório. Não tem tolerância. */
  @Column({ nullable: true })
  revoked_at?: Date;

  /** Texto livre enviado pelo aparelho, para o escritório reconhecer a sessão. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  device?: string;

  @CreateDateColumn()
  created_at!: Date;
}
