/**
 * Popula dados de demonstração usando a API real — serve também como teste
 * ponta a ponta da stack (auth, tenant, validação, novos campos).
 *
 *   node scripts/seed-demo-data.js
 */
const BASE_URL = process.env.API_URL || 'http://localhost:8080';
const EMAIL = process.env.SEED_EMAIL || 'admin@athonis.com';
const PASSWORD = process.env.SEED_PASSWORD || 'admin123';

let token = '';

async function api(method, path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const detail = data?.errors?.length
      ? ` :: ${data.errors.map((e) => `${e.field}: ${e.messages.join(', ')}`).join(' | ')}`
      : '';
    throw new Error(`${method} ${path} -> ${response.status} ${data?.message ?? ''}${detail}`);
  }

  return data;
}

const VEHICLE_DETAILS = [
  { plate: 'RQK2A45', type: 'van', capacity_kg: 1200, status: 'available' },
  { plate: 'FTB7C12', type: 'truck', capacity_kg: 4500, status: 'available' },
  { plate: 'LMN9D88', type: 'utility', capacity_kg: 800, status: 'maintenance' },
];

const DRIVER_DETAILS = [
  { phone: '(11) 98877-1122', cnh: '04512368900', status: 'available' },
  { phone: '(11) 97766-3344', cnh: '03987451200', status: 'available' },
  { phone: '(11) 96655-5566', cnh: '05123478600', status: 'unavailable' },
];

const ORDER_TEMPLATES = [
  { title: 'Entrega de perfis de alumínio', urgency: 'normal', quantity: 40, value: 8450.0, status: 'pending', window: '08:00 - 12:00' },
  { title: 'Reposição de dobradiças', urgency: 'high', quantity: 120, value: 3200.5, status: 'planned', window: '13:00 - 17:00' },
  { title: 'Kit corrediças telescópicas', urgency: 'normal', quantity: 60, value: 5100.0, status: 'in_route', window: '08:00 - 12:00' },
  { title: 'Puxadores linha premium', urgency: 'critical', quantity: 25, value: 12750.9, status: 'delayed', window: '18:00 - 22:00' },
  { title: 'Fechaduras para armário', urgency: 'low', quantity: 200, value: 2890.0, status: 'delivered', window: '13:00 - 17:00' },
  { title: 'Trilhos para porta de correr', urgency: 'normal', quantity: 15, value: 6300.0, status: 'pending', window: '08:00 - 12:00' },
  { title: 'Suportes para prateleira', urgency: 'high', quantity: 300, value: 4150.75, status: 'planned', window: '13:00 - 17:00' },
];

function isoDaysFromNow(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function main() {
  console.log(`Populando ${BASE_URL}...\n`);

  const auth = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  token = auth.access_token;
  console.log(`Autenticado como ${auth.user.email} (empresa ${auth.user.id_company})\n`);

  // ---- Veículos: completar os campos novos
  const vehicles = (await api('GET', '/vehicles?page=1&limit=50')).items ?? [];
  console.log(`Veículos existentes: ${vehicles.length}`);

  for (let index = 0; index < vehicles.length; index += 1) {
    const vehicle = vehicles[index];
    const details = VEHICLE_DETAILS[index % VEHICLE_DETAILS.length];
    if (vehicle.plate) {
      console.log(`  ${vehicle.name}: já tem placa ${vehicle.plate}`);
      continue;
    }
    await api('PATCH', `/vehicles/${vehicle.vehicle_id}`, details);
    console.log(`  ${vehicle.name} -> placa ${details.plate}, ${details.capacity_kg}kg, ${details.type}`);
  }

  // ---- Motoristas: completar telefone/CNH/status
  const drivers = (await api('GET', '/drivers?page=1&limit=50')).items ?? [];
  console.log(`\nMotoristas existentes: ${drivers.length}`);

  for (let index = 0; index < drivers.length; index += 1) {
    const driver = drivers[index];
    const details = DRIVER_DETAILS[index % DRIVER_DETAILS.length];
    if (driver.cnh) {
      console.log(`  ${driver.name}: já tem CNH`);
      continue;
    }
    await api('PATCH', `/drivers/${driver.driver_id}`, details);
    console.log(`  ${driver.name} -> CNH ${details.cnh}, ${details.status}`);
  }

  // ---- Pedidos
  const clients = (await api('GET', '/clients?page=1&limit=50')).items ?? [];
  const existingOrders = (await api('GET', '/orders?page=1&limit=1')).meta?.total ?? 0;

  console.log(`\nClientes: ${clients.length} | pedidos já cadastrados: ${existingOrders}`);

  if (existingOrders > 0) {
    console.log('  Pedidos já existem — nada a criar.');
    console.log('\nConcluído.');
    return;
  }

  const freshVehicles = (await api('GET', '/vehicles?page=1&limit=50')).items ?? [];
  const freshDrivers = (await api('GET', '/drivers?page=1&limit=50')).items ?? [];

  for (let index = 0; index < ORDER_TEMPLATES.length; index += 1) {
    const template = ORDER_TEMPLATES[index];
    const client = clients[index % clients.length];
    const vehicle = freshVehicles[index % freshVehicles.length];
    const driver = freshDrivers[index % freshDrivers.length];

    // O último pedido fica sem motorista de propósito: serve para exercitar o
    // relatório de pedidos não roteirizáveis (unassignedOrders).
    const withoutDriver = index === ORDER_TEMPLATES.length - 1;

    const order = await api('POST', '/orders', {
      client_id: client.client_id,
      title: template.title,
      description: `Pedido de demonstração para ${client.name}`,
      urgency: template.urgency,
      status: template.status,
      quantity: template.quantity,
      value: template.value,
      delivery_window: template.window,
      delivery_date: isoDaysFromNow(index - 2),
      vehicle_id: withoutDriver ? undefined : vehicle?.vehicle_id,
      driver_id: withoutDriver ? undefined : driver?.driver_id,
      delivery_street: client.street,
      delivery_number: client.number,
      delivery_district: client.neighborhood,
      delivery_city: client.city,
      delivery_state: client.state,
      delivery_zipcode: client.zip_code,
    });

    console.log(
      `  #${order.order_id} ${template.title} (${template.status}, ${template.urgency})` +
        (withoutDriver ? ' — sem motorista/veículo de propósito' : ''),
    );
  }

  console.log('\nConcluído.');
}

main().catch((error) => {
  console.error('\nFalha:', error.message);
  process.exit(1);
});
