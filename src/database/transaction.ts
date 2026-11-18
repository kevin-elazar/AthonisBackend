import { DataSource, EntityManager } from 'typeorm';

/**
 * Fila de transações por conexão SQLite.
 *
 * O driver SQLite do TypeORM usa uma conexão só: duas transações abertas ao
 * mesmo tempo viram uma transação com savepoint dentro da outra, e o commit
 * de uma pode ser desfeito pelo rollback da outra. No PostgreSQL cada
 * transação tem a sua conexão do pool e o banco cuida da concorrência; lá a
 * fila não existe. O SQLite só roda na suíte e2e (produção recusa no boot).
 */
const sqliteQueues = new WeakMap<DataSource, Promise<unknown>>();

export function runInTransaction<T>(
  dataSource: DataSource,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  if (dataSource.options?.type !== 'sqlite') {
    return dataSource.transaction(work);
  }

  const previous = sqliteQueues.get(dataSource) ?? Promise.resolve();
  const run = previous.then(() => dataSource.transaction(work));
  sqliteQueues.set(
    dataSource,
    run.catch(() => undefined),
  );
  return run;
}
