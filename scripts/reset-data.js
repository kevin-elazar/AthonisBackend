/**
 * Zera os dados operacionais, preservando uma empresa e um usuário.
 *
 * Serve para começar um teste manual do zero sem recriar o banco à mão. Apaga
 * clientes, motoristas, veículos, pedidos, histórico de rotas e cache de
 * imagens; mantém a empresa e o usuário informados e remove os demais.
 *
 * O banco é copiado antes de qualquer escrita — sem backup, um engano aqui
 * não tem volta.
 *
 * Uso:
 *   node scripts/reset-data.js --confirmar
 *   node scripts/reset-data.js --confirmar --empresa=-1 --usuario=admin@athonis.com
 *
 * Sem --confirmar o script apenas mostra o que seria apagado.
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

const args = process.argv.slice(2);
const flag = (nome, padrao) => {
  const encontrado = args.find((a) => a.startsWith(`--${nome}=`));
  return encontrado ? encontrado.split('=').slice(1).join('=') : padrao;
};

const CONFIRMAR = args.includes('--confirmar');
const EMPRESA = Number(flag('empresa', process.env.RESET_COMPANY ?? '-1'));
const USUARIO = flag('usuario', process.env.RESET_USER ?? 'admin@athonis.com');

const DB_PATH = path.resolve(
  __dirname,
  '..',
  (process.env.DB_NAME ?? './src/database/database.sqlite').replace(/^\.\//, ''),
);

/** Tabelas esvaziadas por completo, na ordem em que podem ser apagadas. */
const TABELAS_OPERACIONAIS = [
  'order',
  'optimized_route_history',
  'street_view_cache',
  'client',
  'driver',
  'vehicle',
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
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Banco não encontrado em ${DB_PATH}`);
    process.exit(1);
  }

  const db = new sqlite3.Database(DB_PATH);

  const empresas = await all(db, 'SELECT id_company, trade_name, corporate_name FROM company');
  const usuarios = await all(db, 'SELECT id, email, id_company FROM user');

  const empresaMantida = empresas.find((e) => e.id_company === EMPRESA);
  const usuarioMantido = usuarios.find((u) => u.email === USUARIO);

  if (!empresaMantida) {
    console.error(`Empresa ${EMPRESA} não existe. Nada foi alterado.`);
    console.error('Empresas: ' + empresas.map((e) => `${e.id_company} (${e.trade_name})`).join(', '));
    process.exit(1);
  }

  if (!usuarioMantido) {
    console.error(`Usuário ${USUARIO} não existe. Nada foi alterado.`);
    console.error('Usuários: ' + usuarios.map((u) => u.email).join(', '));
    process.exit(1);
  }

  if (usuarioMantido.id_company !== EMPRESA) {
    console.error(
      `Usuário ${USUARIO} pertence à empresa ${usuarioMantido.id_company}, não à ${EMPRESA}. ` +
        'Manter os dois deixaria o login sem empresa. Nada foi alterado.',
    );
    process.exit(1);
  }

  console.log(`Banco:    ${DB_PATH}`);
  console.log(`Manter:   empresa ${EMPRESA} (${empresaMantida.trade_name}) e usuário ${USUARIO}`);

  for (const tabela of TABELAS_OPERACIONAIS) {
    const [{ n }] = await all(db, `SELECT COUNT(*) n FROM "${tabela}"`);
    console.log(`Apagar:   ${n} de ${tabela}`);
  }
  const outrasEmpresas = empresas.filter((e) => e.id_company !== EMPRESA);
  const outrosUsuarios = usuarios.filter((u) => u.email !== USUARIO);
  console.log(`Apagar:   ${outrasEmpresas.length} empresa(s), ${outrosUsuarios.length} usuário(s)`);

  if (!CONFIRMAR) {
    console.log('\nSimulação: rode de novo com --confirmar para aplicar.');
    db.close();
    return;
  }

  const backup = `${DB_PATH}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(DB_PATH, backup);
  console.log(`\nBackup:   ${backup}`);

  await run(db, 'PRAGMA foreign_keys = OFF');
  await run(db, 'BEGIN');
  try {
    for (const tabela of TABELAS_OPERACIONAIS) {
      await run(db, `DELETE FROM "${tabela}"`);
    }
    await run(db, 'DELETE FROM user WHERE email <> ?', [USUARIO]);
    await run(db, 'DELETE FROM company WHERE id_company <> ?', [EMPRESA]);

    // Ids voltam a contar do 1: num banco de teste, pedido #1 e pedido #57
    // contam histórias diferentes sobre o que aconteceu ali.
    await run(db, 'DELETE FROM sqlite_sequence WHERE name IN (' +
      TABELAS_OPERACIONAIS.map(() => '?').join(', ') + ')', TABELAS_OPERACIONAIS);

    await run(db, 'COMMIT');
  } catch (erro) {
    await run(db, 'ROLLBACK');
    console.error('Falhou, nada foi alterado:', erro.message);
    db.close();
    process.exit(1);
  }

  await run(db, 'VACUUM');

  const restantes = await all(db, 'SELECT id_company, trade_name FROM company');
  const login = await all(db, 'SELECT email, role, id_company FROM user');
  console.log('\nEmpresa:  ' + restantes.map((e) => `${e.id_company} (${e.trade_name})`).join(', '));
  console.log('Usuário:  ' + login.map((u) => `${u.email} [${u.role}] empresa ${u.id_company}`).join(', '));
  console.log('Pronto.');

  db.close();
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
