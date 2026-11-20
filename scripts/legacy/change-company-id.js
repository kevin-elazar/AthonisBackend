/**
 * Troca o identificador de uma empresa, levando junto todas as linhas que
 * apontam para ela.
 *
 * O `id_company` aparece solto em cada tabela — não há chave estrangeira que
 * atualize em cascata. Trocar só na tabela `company` deixaria clientes,
 * pedidos e o próprio usuário órfãos, e o login pararia de enxergar os dados.
 *
 * Uso:
 *   node scripts/change-company-id.js --de=-1 --para=1
 *   node scripts/change-company-id.js --de=-1 --para=1 --confirmar
 *
 * Sem --confirmar apenas mostra o que seria alterado.
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

const args = process.argv.slice(2);
const flag = (nome) => {
  const encontrado = args.find((a) => a.startsWith(`--${nome}=`));
  return encontrado ? encontrado.split('=').slice(1).join('=') : undefined;
};

const CONFIRMAR = args.includes('--confirmar');
const DE = Number(flag('de'));
const PARA = Number(flag('para'));

const DB_PATH = path.resolve(
  __dirname,
  '..',
  (process.env.DB_NAME ?? './src/database/database.sqlite').replace(/^\.\//, ''),
);

/** Toda tabela que guarda `id_company` como inteiro solto. */
const TABELAS = [
  'client',
  'driver',
  'vehicle',
  'order',
  'optimized_route_history',
  'street_view_cache',
  'user',
];

const run = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (erro) {
      if (erro) reject(erro);
      else resolve(this.changes);
    });
  });

const all = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (erro, linhas) => (erro ? reject(erro) : resolve(linhas)));
  });

async function main() {
  if (!Number.isInteger(DE) || !Number.isInteger(PARA)) {
    console.error('Informe --de=<id atual> e --para=<id novo>.');
    process.exit(1);
  }
  if (DE === PARA) {
    console.error('Os dois identificadores são iguais. Nada a fazer.');
    process.exit(1);
  }
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Banco não encontrado em ${DB_PATH}`);
    process.exit(1);
  }

  const db = new sqlite3.Database(DB_PATH);

  const origem = await all(db, 'SELECT * FROM company WHERE id_company = ?', [DE]);
  if (origem.length === 0) {
    console.error(`Empresa ${DE} não existe. Nada foi alterado.`);
    process.exit(1);
  }

  const destino = await all(db, 'SELECT id_company FROM company WHERE id_company = ?', [PARA]);
  if (destino.length > 0) {
    console.error(`Já existe empresa com id ${PARA}. Nada foi alterado.`);
    process.exit(1);
  }

  console.log(`Banco:    ${DB_PATH}`);
  console.log(`Empresa:  ${DE} -> ${PARA} (${origem[0].trade_name ?? origem[0].corporate_name})`);

  let total = 0;
  for (const tabela of TABELAS) {
    const [{ n }] = await all(db, `SELECT COUNT(*) n FROM "${tabela}" WHERE id_company = ?`, [DE]);
    total += n;
    if (n > 0) console.log(`Mover:    ${n} de ${tabela}`);
  }
  console.log(`Total:    ${total} linha(s) além da própria empresa`);

  if (!CONFIRMAR) {
    console.log('\nSimulação: rode de novo com --confirmar para aplicar.');
    db.close();
    return;
  }

  const backup = `${DB_PATH}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(DB_PATH, backup);
  console.log(`\nBackup:   ${backup}`);

  await run(db, 'BEGIN');
  try {
    // A empresa vem primeiro: as demais tabelas apontam para ela.
    await run(db, 'UPDATE company SET id_company = ? WHERE id_company = ?', [PARA, DE]);
    for (const tabela of TABELAS) {
      await run(db, `UPDATE "${tabela}" SET id_company = ? WHERE id_company = ?`, [PARA, DE]);
    }
    await run(db, 'COMMIT');
  } catch (erro) {
    await run(db, 'ROLLBACK');
    console.error('Falhou, nada foi alterado:', erro.message);
    db.close();
    process.exit(1);
  }

  const restante = await all(db, 'SELECT id_company, trade_name FROM company');
  const login = await all(db, 'SELECT email, id_company FROM user');
  console.log('\nEmpresas: ' + restante.map((e) => `${e.id_company} (${e.trade_name})`).join(', '));
  console.log('Usuários: ' + login.map((u) => `${u.email} -> empresa ${u.id_company}`).join(', '));
  console.log('Pronto. Faça login de novo: o token antigo carrega a empresa anterior.');

  db.close();
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
