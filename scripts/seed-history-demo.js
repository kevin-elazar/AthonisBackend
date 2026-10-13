/**
 * Cria rotas já executadas nos dias anteriores, com tudo o que o aplicativo
 * teria enviado: saída, chegadas, entregas, ocorrências, encerramento e o
 * rastro de GPS.
 *
 * Serve para o painel "Execução em campo" ter o que mostrar — distância
 * planejada × executada, atraso por parada, paradas fora de ordem, tempo
 * ocioso — sem precisar rodar dias de rota de verdade. São dados inventados:
 * tudo fica marcado com created_by = 'seed-history-demo' e sai com --limpar.
 *
 * Uso:
 *   node scripts/seed-history-demo.js              # 6 rotas, 2 motoristas de demonstração
 *   node scripts/seed-history-demo.js --rotas 12
 *   node scripts/seed-history-demo.js --limpar     # apaga o que este script criou
 *
 * A consolidação (route_execution_metrics) não é gravada aqui: o painel a
 * calcula na primeira vez que abre, pelo mesmo código que consolida uma rota
 * encerrada pelo aplicativo.
 */
const path = require('path');
const { randomUUID } = require('crypto');
const sqlite3 = require('sqlite3');
require('dotenv').config();

const DB_PATH = process.env.DB_NAME || './src/database/database.sqlite';
const AUTHOR = 'seed-history-demo';

const DEPOT = { lat: -26.4851, lng: -49.0669 };

const STOPS = [
  { title: 'Dobradiças e corrediças', street: 'Rua Walter Marquardt', number: '1548', district: 'Barra do Rio Molha', lat: -26.4741, lng: -49.0993 },
  { title: 'Puxadores linha premium', street: 'Rua Bernardo Dornbusch', number: '2155', district: 'Baependi', lat: -26.4708, lng: -49.0655 },
  { title: 'Chapas de MDF 18mm', street: 'Rua Roberto Ziemann', number: '2600', district: 'Amizade', lat: -26.4552, lng: -49.0741 },
  { title: 'Fechaduras para armário', street: 'Rua Epitácio Pessoa', number: '1081', district: 'Centro', lat: -26.4836, lng: -49.0699 },
  { title: 'Trilhos para porta de correr', street: 'Rua Presidente Epitácio Pessoa', number: '2850', district: 'Vila Lenzi', lat: -26.4962, lng: -49.0858 },
  { title: 'Ferragens para cozinha', street: 'Rua José Theodoro Ribeiro', number: '1500', district: 'Ilha da Figueira', lat: -26.4983, lng: -49.0479 },
  { title: 'Kit de parafusos e buchas', street: 'Rua Manoel Francisco da Costa', number: '4300', district: 'João Pessoa', lat: -26.4423, lng: -49.0448 },
  { title: 'Suportes para prateleira', street: 'Rua Angelo Rubini', number: '1011', district: 'Barra do Rio Cerro', lat: -26.5131, lng: -49.1164 },
];

const OCCURRENCES = [
  ['customer_absent', 'Ninguém atendeu o interfone'],
  ['closed_establishment', 'Empresa fechada para almoço'],
  ['refused', 'Cliente recusou: pedido divergente'],
  ['access_restricted', 'Portaria não liberou a entrada do caminhão'],
  ['address_not_found', 'Número não existe na rua'],
];

const DEMO_DRIVERS = ['Carla Demonstração', 'Bruno Demonstração'];

const PLANNED_SPEED_MPS = 8.3; // ~30 km/h
const PLANNED_SERVICE_MIN = 10;
const PING_INTERVAL_S = 15;

// ------------------------------------------------------------------ apoio

/** Gerador determinístico: rodar duas vezes produz as mesmas rotas. */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function haversine(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** Formato em que o TypeORM grava datas no SQLite (UTC). */
const sqlDate = (ms) => new Date(ms).toISOString().replace('T', ' ').replace('Z', '');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) args[argv[i].slice(2)] = true;
    else {
      args[argv[i].slice(2)] = next;
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
const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows)));
  });

/** Meio-dia UTC do dia `offset` dias atrás, no fuso de Brasília (UTC-3), às 08:00 locais. */
function dayStartMs(offset) {
  const now = new Date();
  const local = new Date(now.getTime() - 3 * 3600_000);
  const midnightUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - offset);
  return { day: new Date(midnightUtc).toISOString().slice(0, 10), startMs: midnightUtc + 11 * 3600_000 };
}

// ------------------------------------------------------------------ limpeza

async function clean() {
  const routes = await all('SELECT route_id, history_id FROM route WHERE created_by = ?', [AUTHOR]);
  const ids = routes.map((route) => route.route_id);
  if (ids.length > 0) {
    const marks = ids.map(() => '?').join(',');
    await run(`DELETE FROM route_event WHERE route_id IN (${marks})`, ids);
    await run(`DELETE FROM route_location_ping WHERE route_id IN (${marks})`, ids);
    await run(`DELETE FROM route_execution_metrics WHERE route_id IN (${marks})`, ids);
    await run(`DELETE FROM "order" WHERE route_id IN (${marks})`, ids);
    await run(`DELETE FROM route WHERE route_id IN (${marks})`, ids);
  }
  await run('DELETE FROM optimized_route_history WHERE created_by = ?', [AUTHOR]);
  await run(
    'DELETE FROM driver WHERE created_by = ? AND driver_id NOT IN (SELECT driver_id FROM route WHERE driver_id IS NOT NULL)',
    [AUTHOR],
  );
  console.log(`Removidas ${ids.length} rota(s) de demonstração e o que dependia delas.`);
}

// ------------------------------------------------------------------ geração

async function createRoute({ idCompany, driver, vehicleId, offset, index, random }) {
  const { day, startMs } = dayStartMs(offset);
  const count = 4 + Math.floor(random() * 3);
  const first = Math.floor(random() * STOPS.length);
  const planned = Array.from({ length: count }, (_, i) => STOPS[(first + i * 3) % STOPS.length]).filter(
    (stop, i, list) => list.indexOf(stop) === i,
  );

  // ---- Planejado: ordem, chegada prevista e totais, como a otimização devolveria.
  let cursor = DEPOT;
  let plannedMs = startMs;
  let plannedDistance = 0;
  const plannedArrival = planned.map((stop) => {
    const leg = haversine(cursor, stop);
    plannedDistance += leg;
    plannedMs += (leg / PLANNED_SPEED_MPS) * 1000;
    const arrival = plannedMs;
    plannedMs += PLANNED_SERVICE_MIN * 60_000;
    cursor = stop;
    return arrival;
  });
  plannedDistance += haversine(cursor, DEPOT);

  // ---- Pedidos e rota
  const route = await run(
    `INSERT INTO route
       (id_company, driver_id, vehicle_id, status, planned_date, total_distance_m, total_duration_min, simulated, region, created_by)
     VALUES (?, ?, ?, 'completed', ?, ?, ?, 0, 'Jaraguá do Sul', ?)`,
    [
      idCompany,
      driver.driver_id,
      vehicleId,
      day,
      Math.round(plannedDistance),
      Math.round((plannedMs - startMs) / 60_000),
      AUTHOR,
    ],
  );
  const routeId = route.lastID;

  const orderIds = [];
  for (const [i, stop] of planned.entries()) {
    const order = await run(
      `INSERT INTO "order"
         (id_company, title, description, invoice_number, urgency, status, quantity, delivery_window,
          route_id, stop_sequence, driver_id, vehicle_id, delivery_date,
          delivery_street, delivery_number, delivery_district, delivery_city, delivery_state, delivery_zipcode,
          delivery_latitude, delivery_longitude, created_by)
       VALUES (?, ?, 'Pedido de demonstração', ?, 'normal', 'in_route', ?, '08:00 - 12:00', ?, ?, ?, ?, ?, ?, ?, ?, 'Jaraguá do Sul', 'SC', '89250-000', ?, ?, ?)`,
      [
        idCompany,
        stop.title,
        `DEMO-${routeId}-${i + 1}`,
        (i + 1) * 5,
        routeId,
        i + 1,
        driver.driver_id,
        vehicleId,
        day,
        stop.street,
        stop.number,
        stop.district,
        stop.lat,
        stop.lng,
        AUTHOR,
      ],
    );
    orderIds.push(order.lastID);
  }

  // O resultado da otimização é de onde o backend lê a chegada prevista por parada.
  const history = await run(
    `INSERT INTO optimized_route_history
       (id_company, order_ids, total_routes, total_orders, optimization_time_ms, google_api_response, optimization_result, status, notes, created_by)
     VALUES (?, ?, 1, ?, 0, '{}', ?, 'success', 'Dados de demonstração', ?)`,
    [
      idCompany,
      orderIds.join(','),
      orderIds.length,
      JSON.stringify({
        routes: [
          {
            stops: orderIds.map((orderId, i) => ({
              orderId,
              estimatedArrivalTime: new Date(plannedArrival[i]).toISOString(),
              estimatedDuration: PLANNED_SERVICE_MIN,
            })),
          },
        ],
      }),
      AUTHOR,
    ],
  );
  await run('UPDATE route SET history_id = ? WHERE route_id = ?', [history.lastID, routeId]);

  // ---- Executado: o que o entregador fez de diferente do plano.
  const visitOrder = planned.map((_, i) => i);
  if (count >= 4 && random() < 0.4) {
    const a = 1 + Math.floor(random() * (visitOrder.length - 2));
    [visitOrder[a], visitOrder[a + 1]] = [visitOrder[a + 1], visitOrder[a]];
  }

  const pings = [];
  const events = [];
  let now = startMs + Math.floor(random() * 15) * 60_000;
  let position = DEPOT;
  const startedAt = now;
  events.push({ type: 'route_started', order: null, at: now });

  const addPing = (lat, lng, at) =>
    pings.push({ lat: lat + (random() - 0.5) * 0.00004, lng: lng + (random() - 0.5) * 0.00004, at });

  const wait = (minutes) => {
    const end = now + minutes * 60_000;
    for (; now < end; now += PING_INTERVAL_S * 1000) addPing(position.lat, position.lng, now);
    now = end;
  };

  const drive = (target) => {
    // Um ponto intermediário fora da reta: o trajeto real nunca é a linha direta.
    const detour = (random() - 0.5) * 0.3;
    const via = {
      lat: (position.lat + target.lat) / 2 + (target.lng - position.lng) * detour,
      lng: (position.lng + target.lng) / 2 - (target.lat - position.lat) * detour,
    };
    const speed = PLANNED_SPEED_MPS * (0.7 + random() * 0.5);
    for (const [from, to] of [
      [position, via],
      [via, target],
    ]) {
      const steps = Math.max(1, Math.round(haversine(from, to) / speed / PING_INTERVAL_S));
      for (let step = 1; step <= steps; step += 1) {
        now += PING_INTERVAL_S * 1000;
        addPing(from.lat + ((to.lat - from.lat) * step) / steps, from.lng + ((to.lng - from.lng) * step) / steps, now);
      }
    }
    position = target;
  };

  const idleBefore = random() < 0.35 ? Math.floor(random() * visitOrder.length) : -1;

  for (const [visit, plannedIndex] of visitOrder.entries()) {
    // Parada no caminho que não é entrega: abastecimento, lanche, espera.
    if (visit === idleBefore) wait(6 + Math.floor(random() * 8));

    drive(planned[plannedIndex]);
    const orderId = orderIds[plannedIndex];
    events.push({ type: 'arrived', order: orderId, at: now });

    wait(4 + Math.floor(random() * 14));

    if (random() < 0.15) {
      const [occurrence, notes] = OCCURRENCES[Math.floor(random() * OCCURRENCES.length)];
      events.push({ type: 'failed', order: orderId, at: now, occurrence, notes });
      await run(`UPDATE "order" SET status = 'failed' WHERE order_id = ?`, [orderId]);
    } else {
      events.push({ type: 'delivered', order: orderId, at: now });
      await run(`UPDATE "order" SET status = 'delivered', delivered_at = ? WHERE order_id = ?`, [
        sqlDate(now),
        orderId,
      ]);
    }
  }

  drive(DEPOT);
  events.push({ type: 'route_finished', order: null, at: now });

  await run('UPDATE route SET started_at = ?, finished_at = ? WHERE route_id = ?', [
    sqlDate(startedAt),
    sqlDate(now),
    routeId,
  ]);

  for (const event of events) {
    await run(
      `INSERT INTO route_event
         (id_company, route_id, order_id, driver_id, type, occurrence_type, notes, occurred_at, received_at, client_event_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        idCompany,
        routeId,
        event.order,
        driver.driver_id,
        event.type,
        event.occurrence ?? null,
        event.notes ?? null,
        sqlDate(event.at),
        sqlDate(event.at + 20_000),
        randomUUID(),
      ],
    );
  }

  await run('BEGIN');
  for (const ping of pings) {
    await run(
      `INSERT INTO route_location_ping
         (id_company, route_id, latitude, longitude, accuracy_m, speed_mps, recorded_at, received_at, client_ping_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [idCompany, routeId, ping.lat, ping.lng, 6 + random() * 8, null, sqlDate(ping.at), sqlDate(ping.at + 30_000), randomUUID()],
    );
  }
  await run('COMMIT');

  const failed = events.filter((event) => event.type === 'failed').length;
  console.log(
    `  Rota #${routeId} · ${day} · ${driver.name} · ${planned.length} paradas` +
      (failed ? ` · ${failed} não entregue(s)` : '') +
      ` · ${pings.length} pontos de GPS`,
  );
}

async function main() {
  const args = parseArgs(process.argv);

  const hasTable = await get("SELECT 1 AS ok FROM sqlite_master WHERE name = 'route_location_ping'");
  if (!hasTable) {
    throw new Error('As tabelas novas ainda não existem. Suba o backend uma vez (npm run start:dev) e rode de novo.');
  }

  if (args.limpar) {
    await clean();
    return;
  }

  const company = args.empresa
    ? await get('SELECT id_company FROM company WHERE id_company = ?', [args.empresa])
    : await get('SELECT id_company FROM company ORDER BY id_company LIMIT 1');
  if (!company) throw new Error('Nenhuma empresa encontrada.');
  const idCompany = company.id_company;

  const drivers = [];
  for (const name of DEMO_DRIVERS) {
    let driver = await get('SELECT driver_id, name FROM driver WHERE id_company = ? AND name = ?', [idCompany, name]);
    if (!driver) {
      const created = await run(
        "INSERT INTO driver (id_company, name, status, created_by) VALUES (?, ?, 'available', ?)",
        [idCompany, name, AUTHOR],
      );
      driver = { driver_id: created.lastID, name };
    }
    drivers.push(driver);
  }

  const vehicle = await get('SELECT vehicle_id FROM vehicle WHERE id_company = ? ORDER BY vehicle_id LIMIT 1', [idCompany]);
  const total = Math.min(Math.max(Number(args.rotas) || 6, 1), 40);
  const existing = await get('SELECT COUNT(*) AS total FROM route WHERE created_by = ?', [AUTHOR]);
  const random = createRandom(20261012 + existing.total);

  console.log(`Empresa ${idCompany}: criando ${total} rota(s) executada(s) de demonstração\n`);
  for (let index = 0; index < total; index += 1) {
    await createRoute({
      idCompany,
      driver: drivers[index % drivers.length],
      vehicleId: vehicle?.vehicle_id ?? null,
      // Duas rotas por dia, do dia anterior para trás.
      offset: 1 + Math.floor((existing.total + index) / drivers.length),
      index,
      random,
    });
  }

  console.log('\nAbra Indicadores → Execução em campo no sistema web para ver o resultado.');
  console.log('Para apagar estes dados: node scripts/seed-history-demo.js --limpar');
}

main()
  .catch((error) => {
    console.error('Falha:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
