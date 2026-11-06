import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config();

/**
 * Configuração do banco.
 *
 * - PostgreSQL é o banco da aplicação (desenvolvimento, CI e produção).
 *   Conexão por `DATABASE_URL` ou pelas variáveis `DB_HOST`, `DB_PORT`,
 *   `DB_USER`, `DB_PASSWORD` e `DB_NAME`.
 * - SQLite em memória (`DB_TYPE=sqlite`) existe só para a suíte e2e rodar
 *   sem Docker na máquina do desenvolvedor. Em produção é recusado no boot.
 * - O esquema evolui por migrations (`src/database/migrations`). O
 *   `synchronize` fica ligado apenas no SQLite de teste, que nasce vazio.
 */
export function buildDataSourceOptions(): DataSourceOptions {
  const type = process.env.DB_TYPE || 'postgres';
  const entities = [join(__dirname, '..', '**', '*.entity{.ts,.js}')];
  const logging = process.env.DB_LOGGING === 'true';

  if (type === 'sqlite') {
    return {
      type: 'sqlite',
      database: process.env.DB_NAME || ':memory:',
      entities,
      synchronize: true,
      logging,
    };
  }

  const url = process.env.DATABASE_URL;
  return {
    type: 'postgres',
    ...(url
      ? { url }
      : {
          host: process.env.DB_HOST || 'localhost',
          port: Number(process.env.DB_PORT) || 5432,
          username: process.env.DB_USER || 'athonis',
          password: process.env.DB_PASSWORD || 'athonis',
          database: process.env.DB_NAME || 'athonis',
        }),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    entities,
    migrations: [join(__dirname, '..', 'database', 'migrations', '*{.ts,.js}')],
    migrationsTableName: 'migrations',
    synchronize: false,
    // Só a suíte e2e liga: apaga o esquema e deixa as migrations recriarem.
    dropSchema: process.env.DB_DROP_SCHEMA === 'true',
    migrationsRun: process.env.DB_MIGRATIONS_RUN !== 'false',
    logging,
  };
}

export const databaseConfig: TypeOrmModuleOptions = buildDataSourceOptions();
