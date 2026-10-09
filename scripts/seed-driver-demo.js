/**
 * Prepara um motorista com acesso ao aplicativo e uma rota para hoje.
 *
 * Serve para testar o Athonis Mobile sem depender da otimização do Google:
 * a rota é gravada direto no banco, com paradas em endereços fixos de
 * Jaraguá do Sul. Fica marcada como simulada, do mesmo jeito que uma rota
 * gerada sem a Route Optimization API.
 *
 * Pré-requisito: subir o backend uma vez depois de atualizar o código, para
 * o TypeORM criar as colunas e tabelas novas.
 *
 * Uso:
 *   node scripts/seed-driver-demo.js
 *   node scripts/seed-driver-demo.js --empresa 1 --email motorista@athonis.com --senha "outra-senha"
 *   node scripts/seed-driver-demo.js --paradas 8
 *
 * Rodar de novo cria outra rota para hoje e mantém o mesmo acesso.
 */
const path = require('path');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcrypt');
require('dotenv').config();

const DB_PATH = process.env.DB_NAME || './src/database/database.sqlite';

const DEFAULT_EMAIL = 'motorista@athonis.com';
// Credencial de demonstração, como a do admin em seed-demo-data.js. Troque com --senha.
const DEFAULT_PASSWORD = process.env.SEED_DRIVER_PASSWORD || 'motorista123';

const STOPS = [
  { title: 'Dobradiças e corrediças', client: 'Móveis Weege', street: 'Rua Walter Marquardt', number: '1548', district: 'Barra do Rio Molha', lat: -26.4741, lng: -49.0993, window: '08:00 - 12:00' },
  { title: 'Puxadores linha premium', client: 'Marcenaria Kohlbach', street: 'Rua Bernardo Dornbusch', number: '2155', district: 'Baependi', lat: -26.4708, lng: -49.0655, window: '08:00 - 12:00' },
  { title: 'Chapas de MDF 18mm', client: 'Indústria de Móveis Rudnick', street: 'Rua Roberto Ziemann', number: '2600', district: 'Amizade', lat: -26.4552, lng: -49.0741, window: '08:00 - 12:00' },
  { title: 'Fechaduras para armário', client: 'Planejados Jaraguá', street: 'Rua Epitácio Pessoa', number: '1081', district: 'Centro', lat: -26.4836, lng: -49.0699, window: '13:00 - 17:00' },
  { title: 'Trilhos para porta de correr', client: 'Esquadrias Lunelli', street: 'Rua Presidente Epitácio Pessoa', number: '2850', district: 'Vila Lenzi', lat: -26.4962, lng: -49.0858, window: '13:00 - 17:00' },
  { title: 'Ferragens para cozinha', client: 'Construtora Hafermann', street: 'Rua José Theodoro Ribeiro', number: '1500', district: 'Ilha da Figueira', lat: -26.4983, lng: -49.0479, window: '13:00 - 17:00' },
  { title: 'Kit de parafusos e buchas', client: 'Móveis Schroeder', street: 'Rua Manoel Francisco da Costa', number: '4300', district: 'João Pessoa', lat: -26.4423, lng: -49.0448, window: '13:00 - 17:00' },
  { title: 'Suportes para prateleira', client: 'Decorações Nereu Ramos', street: 'Rua Angelo Rubini', number: '1011', district: 'Barra do Rio Cerro', lat: -26.5131, lng: -49.1164, window: '13:00 - 17:00' },
];

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[token.slice(2)] = true;
    } else {
      args[token.slice(2)] = next;
      i += 1;
    }
  }
  return args;
}

const db = new sqlite3.Database(path.resolve(DB_PATH));

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function callback(error) {
      if (error) return reject(error);
      resolve(this);
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => (error ? reject(error) : resolve(row)));
  });

function today(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function main() {
  const args = parseArgs(process.argv);
  const email = args.email || DEFAULT_EMAIL;
  const password = args.senha || DEFAULT_PASSWORD;
  const totalStops = Math.min(Math.max(Number(args.paradas) || 5, 1), STOPS.length);

  const hasColumn = await get(
    "SELECT 1 AS ok FROM pragma_table_info('user') WHERE name = 'driver_id'",
  );
  if (!hasColumn) {
    throw new Error(
      'A coluna user.driver_id ainda não existe. Suba o backend uma vez (npm run start:dev) para atualizar o banco e rode de novo.',
    );
  }

  const company = args.empresa
    ? await get('SELECT id_company, timezone FROM company WHERE id_company = ?', [args.empresa])
    : await get('SELECT id_company, timezone FROM company ORDER BY id_company LIMIT 1');
  if (!company) {
    throw new Error('Nenhuma empresa encontrada. Crie uma com scripts/create-company.js.');
  }
  const idCompany = company.id_company;
  const dia = today(company.timezone || 'America/Sao_Paulo');

  // ---- Motorista: reaproveita o do acesso, senão o primeiro da empresa, senão cria.
  const existingUser = await get('SELECT id, driver_id, id_company FROM user WHERE email = ?', [email]);
  if (existingUser && existingUser.id_company !== idCompany) {
    throw new Error(`O e-mail ${email} já pertence a um usuário de outra empresa.`);
  }

  let driver = existingUser?.driver_id
    ? await get('SELECT driver_id, name FROM driver WHERE driver_id = ? AND id_company = ?', [
        existingUser.driver_id,
        idCompany,
      ])
    : await get('SELECT driver_id, name FROM driver WHERE id_company = ? ORDER BY driver_id LIMIT 1', [
        idCompany,
      ]);

  if (!driver) {
    const created = await run(
      "INSERT INTO driver (id_company, name, status, created_by) VALUES (?, 'Motorista Demo', 'available', 'seed-driver-demo')",
      [idCompany],
    );
    driver = { driver_id: created.lastID, name: 'Motorista Demo' };
  }

  // ---- Acesso ao aplicativo
  const hash = await bcrypt.hash(password, 10);
  if (existingUser) {
    await run(
      "UPDATE user SET password = ?, role = 'driver', driver_id = ?, is_active = 1 WHERE id = ?",
      [hash, driver.driver_id, existingUser.id],
    );
  } else {
    await run(
      "INSERT INTO user (email, password, name, role, id_company, driver_id, is_active, created_by) VALUES (?, ?, ?, 'driver', ?, ?, 1, 'seed-driver-demo')",
      [email, hash, driver.name, idCompany, driver.driver_id],
    );
  }

  // ---- Rota de hoje
  const vehicle = await get(
    'SELECT vehicle_id FROM vehicle WHERE id_company = ? ORDER BY vehicle_id LIMIT 1',
    [idCompany],
  );

  const route = await run(
    `INSERT INTO route
       (id_company, driver_id, vehicle_id, status, planned_date, total_distance_m, total_duration_min, simulated, region, created_by)
     VALUES (?, ?, ?, 'planned', ?, ?, ?, 1, 'Jaraguá do Sul', 'seed-driver-demo')`,
    [idCompany, driver.driver_id, vehicle?.vehicle_id ?? null, dia, totalStops * 4200, totalStops * 22],
  );

  for (let index = 0; index < totalStops; index += 1) {
    const stop = STOPS[index];
    await run(
      `INSERT INTO "order"
         (id_company, title, description, invoice_number, urgency, status, quantity, delivery_window,
          route_id, stop_sequence, driver_id, vehicle_id, delivery_date,
          delivery_street, delivery_number, delivery_district, delivery_city, delivery_state, delivery_zipcode,
          delivery_latitude, delivery_longitude, created_by)
       VALUES (?, ?, ?, ?, 'normal', 'planned', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Jaraguá do Sul', 'SC', '89250-000', ?, ?, 'seed-driver-demo')`,
      [
        idCompany,
        stop.title,
        `Entrega de demonstração para ${stop.client}`,
        `NF-DEMO-${route.lastID}-${index + 1}`,
        (index + 1) * 10,
        stop.window,
        route.lastID,
        index + 1,
        driver.driver_id,
        vehicle?.vehicle_id ?? null,
        dia,
        stop.street,
        stop.number,
        stop.district,
        stop.lat,
        stop.lng,
      ],
    );
  }

  console.log(`Empresa ${idCompany} | motorista #${driver.driver_id} ${driver.name}`);
  console.log(`Acesso ao aplicativo: ${email}`);
  console.log(
    args.senha ? 'Senha: a informada em --senha' : 'Senha: a padrão deste script (veja DEFAULT_PASSWORD)',
  );
  console.log(`Rota #${route.lastID} criada para ${dia}, com ${totalStops} paradas.`);
}

main()
  .catch((error) => {
    console.error('Falha:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
