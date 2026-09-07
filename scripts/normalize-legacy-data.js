/**
 * Normaliza os dados que existiam antes do vocabulário único do domínio.
 *
 * Enquanto o projeto não tem migrations (ver S10 na auditoria), este script é
 * idempotente e pode ser rodado quantas vezes for preciso:
 *
 *   node scripts/normalize-legacy-data.js
 */
const path = require('path');
const sqlite3 = require('sqlite3');
require('dotenv').config();

const DB_PATH = process.env.DB_NAME || './src/database/database.sqlite';

const URGENCY_MAP = {
  baixa: 'low',
  low: 'low',
  normal: 'normal',
  media: 'normal',
  'média': 'normal',
  alta: 'high',
  high: 'high',
  urgente: 'high',
  critica: 'critical',
  'crítica': 'critical',
  critical: 'critical',
};

const db = new sqlite3.Database(path.resolve(DB_PATH));

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function callback(error) {
      if (error) return reject(error);
      resolve(this.changes);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows)));
  });

async function main() {
  console.log(`Normalizando ${DB_PATH}...\n`);

  // 1. Urgência: termos legados viram o vocabulário canônico.
  const urgencies = await all('SELECT DISTINCT urgency FROM "order"');
  let urgencyChanges = 0;

  for (const row of urgencies) {
    const current = row.urgency;
    if (!current) continue;
    const canonical = URGENCY_MAP[String(current).trim().toLowerCase()];

    if (canonical && canonical !== current) {
      const changes = await run('UPDATE "order" SET urgency = ? WHERE urgency = ?', [
        canonical,
        current,
      ]);
      console.log(`  urgency: "${current}" -> "${canonical}" (${changes} pedido(s))`);
      urgencyChanges += changes;
    } else if (!canonical) {
      const changes = await run('UPDATE "order" SET urgency = ? WHERE urgency = ?', [
        'normal',
        current,
      ]);
      console.log(`  urgency: "${current}" desconhecida -> "normal" (${changes} pedido(s))`);
      urgencyChanges += changes;
    }
  }
  if (urgencyChanges === 0) console.log('  urgency: nada a normalizar');

  // 2. Colunas novas: preencher onde o synchronize deixou NULL.
  const defaults = [
    ['order', 'status', 'pending'],
    ['client', 'status', 'active'],
    ['driver', 'status', 'available'],
    ['vehicle', 'status', 'available'],
    ['vehicle', 'type', 'van'],
  ];

  console.log('');
  for (const [table, column, value] of defaults) {
    try {
      const changes = await run(
        `UPDATE "${table}" SET ${column} = ? WHERE ${column} IS NULL OR ${column} = ''`,
        [value],
      );
      console.log(`  ${table}.${column} = "${value}" (${changes} linha(s))`);
    } catch (error) {
      console.log(`  ${table}.${column}: coluna ainda não existe (${error.message})`);
    }
  }

  // 3. Pedidos entregues sem data de conclusão ficam com a data de criação.
  try {
    const changes = await run(
      `UPDATE "order" SET delivered_at = created_at WHERE status = 'delivered' AND delivered_at IS NULL`,
    );
    console.log(`  order.delivered_at preenchido (${changes} linha(s))`);
  } catch (error) {
    console.log(`  order.delivered_at: ${error.message}`);
  }

  console.log('\nConcluído.');
  db.close();
}

main().catch((error) => {
  console.error('Falha na normalização:', error.message);
  db.close();
  process.exit(1);
});
