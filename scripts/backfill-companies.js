/**
 * Cria o cadastro de empresa para tenants que já existiam antes da tabela
 * `company` — os dados sempre tiveram `id_company`, mas não havia onde
 * guardar nome, depósito e custos.
 *
 * Idempotente: só cria o que falta.
 *
 *   node scripts/backfill-companies.js
 */
const path = require('path');
const sqlite3 = require('sqlite3');
require('dotenv').config();

const DB_PATH = process.env.DB_NAME || './src/database/database.sqlite';
const db = new sqlite3.Database(path.resolve(DB_PATH));

const all = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows))),
  );

const run = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function callback(error) {
      if (error) return reject(error);
      resolve(this);
    }),
  );

async function main() {
  // Todo id_company que aparece em qualquer tabela de dados.
  const rows = await all(`
    SELECT DISTINCT id_company FROM user
    UNION SELECT DISTINCT id_company FROM client
    UNION SELECT DISTINCT id_company FROM driver
    UNION SELECT DISTINCT id_company FROM vehicle
    UNION SELECT DISTINCT id_company FROM "order"
  `);

  const existing = await all('SELECT id_company FROM company');
  const known = new Set(existing.map((row) => row.id_company));

  const missing = rows.map((row) => row.id_company).filter((id) => !known.has(id));

  if (missing.length === 0) {
    console.log('Todos os tenants já têm cadastro de empresa.');
    db.close();
    return;
  }

  for (const idCompany of missing) {
    const label =
      idCompany === -1 ? 'Empresa de Desenvolvimento' : `Empresa ${idCompany}`;

    await run(
      `INSERT INTO company (
         id_company, corporate_name, trade_name, document,
         cost_per_km, cost_per_hour, stop_duration_minutes, default_vehicle_capacity_kg,
         timezone, is_active, created_at, created_by, updated_at, updated_by
       ) VALUES (?,?,?,?, 1.0, 50.0, 30, 1000, 'America/Sao_Paulo', 1, datetime('now'), 'backfill', datetime('now'), 'backfill')`,
      [idCompany, label, label, '00000000000000'],
    );

    console.log(`  criada empresa ${idCompany} — "${label}" (complete os dados em Configurações)`);
  }

  console.log(`\n${missing.length} empresa(s) criada(s).`);
  db.close();
}

main().catch((error) => {
  console.error('Falha:', error.message);
  db.close();
  process.exit(1);
});
