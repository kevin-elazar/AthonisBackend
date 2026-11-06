import { FindOperator, ILike, Like, ValueTransformer } from 'typeorm';

/**
 * Diferenças entre os bancos suportados.
 *
 * Produção e CI rodam em PostgreSQL. O SQLite em memória continua aceito só
 * para a suíte e2e local rodar sem Docker; ele nunca é usado em produção
 * (o boot recusa `DB_TYPE=sqlite` com `NODE_ENV=production`).
 *
 * As entities são carregadas uma vez por processo, então ler o DB_TYPE aqui
 * é seguro: o tipo de banco não muda com a aplicação no ar.
 */
export const isPostgres = (): boolean => (process.env.DB_TYPE || 'postgres') === 'postgres';

/** Data e hora com fuso. `timestamptz` no PostgreSQL, `datetime` no SQLite. */
export const DATETIME_TYPE = isPostgres() ? 'timestamptz' : 'datetime';

/**
 * O driver do PostgreSQL devolve `numeric` como string, para não perder
 * precisão. Coordenadas e valores monetários do sistema cabem em number.
 */
export const decimalTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) =>
    value === null || value === undefined ? value : Number(value),
};

/**
 * Busca "contém", sem diferenciar maiúsculas. O LIKE do SQLite já ignora a
 * caixa; o do PostgreSQL não, por isso lá vira ILIKE.
 */
export function containsInsensitive(term: string): FindOperator<string> {
  const pattern = `%${term}%`;
  return isPostgres() ? ILike(pattern) : Like(pattern);
}
