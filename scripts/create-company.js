/**
 * Cria uma empresa (tenant) nova diretamente no banco.
 *
 * Criar empresa é operação de administração do sistema, não de aplicação:
 * por isso não existe POST /company. Este script também cria o primeiro
 * usuário admin do tenant — sem ele ninguém conseguiria entrar, já que
 * /auth/register exige um admin já autenticado.
 *
 * Uso:
 *   node scripts/create-company.js --id 1001 \
 *     --nome "Athonis Logistica Ltda" \
 *     --fantasia "Athonis" \
 *     --cnpj 12345678000199 \
 *     --admin-email admin@athonis.com \
 *     --admin-senha "uma-senha-forte" \
 *     --admin-nome "Administrador"
 *
 * Opcionais do depósito (origem das rotas):
 *   --cidade "Sao Paulo" --uf SP --rua "Av. Paulista" --numero 1000
 *   --bairro "Bela Vista" --cep 01310-100 --lat -23.5613 --lng -46.6560
 *
 * Listar as empresas existentes:
 *   node scripts/create-company.js --listar
 */
const bcrypt = require('bcrypt');
const { openDb } = require('./lib/db');


function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

let db;
const run = (sql, params) => db.run(sql, params);
const all = (sql, params) => db.all(sql, params);
const get = (sql, params) => db.get(sql, params);

/** Erro de uso (parâmetro faltando, id repetido): mostra só a mensagem. */
class FalhaEsperada extends Error {}

function fail(message) {
  throw new FalhaEsperada(message);
}

async function listCompanies() {
  const rows = await all(
    'SELECT id_company, corporate_name, trade_name, document, depot_city, is_active FROM company ORDER BY id_company',
  );

  if (rows.length === 0) {
    console.log('Nenhuma empresa cadastrada.');
    return;
  }

  console.log('\nEmpresas cadastradas:\n');
  for (const row of rows) {
    const users = await get('SELECT COUNT(*) AS n FROM "user" WHERE id_company = ?', [row.id_company]);
    console.log(
      `  [${row.id_company}] ${row.trade_name || row.corporate_name}` +
        ` — CNPJ ${row.document}` +
        ` — ${row.depot_city || 'sem depósito'}` +
        ` — ${users.n} usuário(s)` +
        `${row.is_active ? '' : ' — INATIVA'}`,
    );
  }
  console.log('');
}

async function main() {
  const args = parseArgs(process.argv);
  db = await openDb();

  if (args.listar) {
    await listCompanies();
    await db.close();
    return;
  }

  const required = {
    id: 'identificador numérico da empresa (--id)',
    nome: 'razão social (--nome)',
    cnpj: 'CNPJ (--cnpj)',
    'admin-email': 'email do primeiro admin (--admin-email)',
    'admin-senha': 'senha do primeiro admin (--admin-senha)',
  };

  const missing = Object.entries(required)
    .filter(([key]) => !args[key])
    .map(([, description]) => description);

  if (missing.length > 0) {
    fail(`faltam parâmetros obrigatórios:\n  - ${missing.join('\n  - ')}`);
  }

  const idCompany = Number(args.id);
  if (!Number.isInteger(idCompany)) {
    fail('--id precisa ser um número inteiro');
  }

  if (String(args['admin-senha']).length < 6) {
    fail('a senha do admin precisa ter ao menos 6 caracteres');
  }

  // O identificador é escolhido por quem administra: não pode colidir.
  const existing = await get('SELECT id_company FROM company WHERE id_company = ?', [idCompany]);
  if (existing) {
    fail(`já existe uma empresa com id_company = ${idCompany}. Use outro identificador.`);
  }

  const emailInUse = await get('SELECT id FROM "user" WHERE email = ?', [args['admin-email']]);
  if (emailInUse) {
    fail(`o email ${args['admin-email']} já está em uso por outro usuário.`);
  }

  try {
    await run('BEGIN');
    await run(
      `INSERT INTO company (
         id_company, corporate_name, trade_name, document, state_registration,
         email, phone, website,
         depot_street, depot_number, depot_complement, depot_district,
         depot_city, depot_state, depot_zip_code, depot_latitude, depot_longitude,
         cost_per_km, cost_per_hour, stop_duration_minutes, default_vehicle_capacity_kg,
         operation_start_time, operation_end_time,
         timezone, is_active, created_at, created_by, updated_at, updated_by
       ) VALUES (?,?,?,?,?, ?,?,?, ?,?,?,?, ?,?,?,?,?, ?,?,?,?, ?,?, ?,TRUE, datetime('now'), 'script', datetime('now'), 'script')`,
      [
        idCompany,
        args.nome,
        args.fantasia || args.nome,
        String(args.cnpj).replace(/[^0-9]/g, ''),
        args.ie || null,
        args.email || null,
        args.telefone || null,
        args.site || null,
        args.rua || null,
        args.numero || null,
        args.complemento || null,
        args.bairro || null,
        args.cidade || null,
        args.uf ? String(args.uf).toUpperCase() : null,
        args.cep || null,
        args.lat ? Number(args.lat) : null,
        args.lng ? Number(args.lng) : null,
        args['custo-km'] ? Number(args['custo-km']) : 1.0,
        args['custo-hora'] ? Number(args['custo-hora']) : 50.0,
        args['tempo-parada'] ? Number(args['tempo-parada']) : 30,
        args['capacidade-padrao'] ? Number(args['capacidade-padrao']) : 1000,
        args['inicio-operacao'] || null,
        args['fim-operacao'] || null,
        args.timezone || 'America/Sao_Paulo',
      ],
    );

    const passwordHash = await bcrypt.hash(String(args['admin-senha']), 10);

    await run(
      `INSERT INTO "user" (id_company, email, password, name, role, is_active, created_at, created_by, updated_at, updated_by)
       VALUES (?,?,?,?,'admin',TRUE, datetime('now'), 'script', datetime('now'), 'script')`,
      [
        idCompany,
        args['admin-email'],
        passwordHash,
        args['admin-nome'] || 'Administrador',
      ],
    );

    await run('COMMIT');
  } catch (error) {
    await run('ROLLBACK');
    fail(`falha ao criar a empresa: ${error.message}`);
  }

  console.log(`\nEmpresa criada com sucesso.\n`);
  console.log(`  id_company : ${idCompany}`);
  console.log(`  Razão social: ${args.nome}`);
  console.log(`  Admin       : ${args['admin-email']}`);

  if (!args.lat || !args.lng) {
    console.log(
      `\n  Atenção: sem coordenadas de depósito (--lat/--lng), as rotas desta empresa\n` +
        `  partem do ponto padrão em São Paulo. Cadastre o depósito em Configurações.`,
    );
  }

  console.log('');
  await db.close();
}

main().catch((error) => {
  if (error instanceof FalhaEsperada) {
    console.error(`
Erro: ${error.message}
`);
  } else {
    console.error('Falha inesperada:', error.message);
  }
  Promise.resolve(db && db.close()).finally(() => process.exit(1));
});
