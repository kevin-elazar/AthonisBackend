/**
 * Acesso ao banco para os scripts de manutenção e de dados de demonstração.
 *
 * Os scripts escrevem SQL simples com marcadores `?`. Este adaptador executa o
 * mesmo SQL no PostgreSQL (o banco da aplicação) ou, se DB_TYPE=sqlite, num
 * arquivo SQLite antigo (útil só para migrar dados legados).
 *
 * Interface (igual nos dois bancos):
 *   const db = await openDb();
 *   const { lastID, changes } = await db.run(sql, params);
 *   const row  = await db.get(sql, params);
 *   const rows = await db.all(sql, params);
 *   await db.transaction(async () => { ... });
 *   await db.close();
 *
 * Diferenças tratadas aqui:
 *   - `?` vira `$1, $2...` no PostgreSQL;
 *   - INSERT sem RETURNING ganha `RETURNING *`, e lastID é a primeira coluna
 *     da linha criada (a chave primária, que nas tabelas do TypeORM vem antes);
 *   - `datetime('now')` vira CURRENT_TIMESTAMP;
 *   - a tabela `user` é palavra reservada no PostgreSQL: escreva `"user"`
 *     nos scripts, o que funciona nos dois bancos.
 */
const path = require('path');
require('dotenv').config();

const DB_TYPE = process.env.DB_TYPE || 'postgres';

function toPostgres(sql) {
  let index = 0;
  let text = sql.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP').replace(/\?/g, () => {
    index += 1;
    return '$' + index;
  });
  if (/^\s*insert\s/i.test(text) && !/\breturning\b/i.test(text)) {
    text = `${text.replace(/;\s*$/, '')} RETURNING *`;
  }
  return text;
}

async function openPostgres() {
  const { Pool } = require('pg');
  const pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL })
    : new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER || 'athonis',
        password: process.env.DB_PASSWORD || 'athonis',
        database: process.env.DB_NAME || 'athonis',
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      });
  // Um cliente só, para BEGIN/COMMIT valerem para as consultas seguintes.
  const client = await pool.connect();

  const query = (sql, params = []) => client.query(toPostgres(sql), params);

  return {
    type: 'postgres',
    async run(sql, params) {
      const result = await query(sql, params);
      const first = result.rows && result.rows[0];
      return {
        lastID: first ? first[Object.keys(first)[0]] : undefined,
        changes: result.rowCount,
      };
    },
    async get(sql, params) {
      return (await query(sql, params)).rows[0];
    },
    async all(sql, params) {
      return (await query(sql, params)).rows;
    },
    async transaction(work) {
      await client.query('BEGIN');
      try {
        const result = await work();
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    },
    async tableExists(name) {
      const row = (await client.query('SELECT to_regclass($1) AS t', [`public.${name}`])).rows[0];
      return Boolean(row && row.t);
    },
    async columnExists(table, column) {
      const row = (
        await client.query(
          'SELECT 1 AS ok FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2',
          [table, column],
        )
      ).rows[0];
      return Boolean(row);
    },
    async close() {
      client.release();
      await pool.end();
    },
  };
}

async function openSqlite() {
  const sqlite3 = require('sqlite3');
  const file = path.resolve(process.env.DB_NAME || './src/database/database.sqlite');
  const db = new sqlite3.Database(file);

  const api = {
    type: 'sqlite',
    run: (sql, params = []) =>
      new Promise((resolve, reject) =>
        db.run(sql, params, function callback(error) {
          if (error) reject(error);
          else resolve({ lastID: this.lastID, changes: this.changes });
        }),
      ),
    get: (sql, params = []) =>
      new Promise((resolve, reject) => db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row)))),
    all: (sql, params = []) =>
      new Promise((resolve, reject) => db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows)))),
    async transaction(work) {
      await api.run('BEGIN');
      try {
        const result = await work();
        await api.run('COMMIT');
        return result;
      } catch (error) {
        await api.run('ROLLBACK');
        throw error;
      }
    },
    async tableExists(name) {
      return Boolean(await api.get("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?", [name]));
    },
    async columnExists(table, column) {
      return Boolean(await api.get(`SELECT 1 AS ok FROM pragma_table_info('${table}') WHERE name = ?`, [column]));
    },
    close: () => new Promise((resolve) => db.close(() => resolve())),
  };
  return api;
}

async function openDb() {
  return DB_TYPE === 'sqlite' ? openSqlite() : openPostgres();
}

module.exports = { openDb, DB_TYPE, toPostgres };
