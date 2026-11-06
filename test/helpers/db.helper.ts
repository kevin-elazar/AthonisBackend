import { DataSource } from 'typeorm';

/**
 * Consulta crua que funciona nos dois bancos da suíte: escreve-se com `?`
 * (como no SQLite) e, no PostgreSQL, os marcadores viram `$1, $2...`.
 */
export function rawQuery<T = any>(
  dataSource: DataSource,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  let text = sql;
  if (dataSource.options.type === 'postgres') {
    let index = 0;
    text = sql.replace(/\?/g, () => {
      index += 1;
      return '$' + index;
    });
  }
  return dataSource.query(text, params);
}
