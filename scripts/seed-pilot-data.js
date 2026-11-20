/**
 * Dados de demonstração para o staging e para o Demo Day, pela API real:
 * endereço do depósito, clientes com endereço em Jaraguá do Sul (ruas reais,
 * para a geocodificação e a otimização funcionarem) e pedidos pendentes para
 * os próximos dias, prontos para virar rota no painel.
 *
 * As empresas são fictícias; os CNPJs são gerados com dígito verificador
 * válido e não correspondem a empresas reais.
 *
 * Idempotente: cliente com o mesmo documento e pedido com o mesmo título na
 * mesma data não são criados de novo.
 *
 *   SEED_EMAIL=admin@athonis.com SEED_PASSWORD=... node scripts/seed-pilot-data.js
 *   (API_URL padrão: http://localhost:8080; DIAS=3 dias de pedidos a partir de amanhã)
 */
const BASE_URL = (process.env.API_URL || 'http://localhost:8080').replace(/\/+$/, '');
const EMAIL = process.env.SEED_EMAIL || 'admin@athonis.com';
const PASSWORD = process.env.SEED_PASSWORD;
const DIAS = Number(process.env.DIAS || 3);

if (!PASSWORD) {
  console.error('Defina SEED_PASSWORD (senha do admin da empresa).');
  process.exit(1);
}

let token = '';

const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A API limita requisições por minuto: em 429, espera e tenta de novo. */
async function api(method, path, body, tentativa = 1) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 429 && tentativa <= 5) {
    const segundos = Number(response.headers.get('retry-after')) || 30;
    console.log(`limite de requisições; esperando ${segundos}s`);
    await espera(segundos * 1000);
    return api(method, path, body, tentativa + 1);
  }
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

/** CNPJ com dígitos verificadores válidos a partir de uma base de 12 dígitos. */
function cnpj(base12) {
  const digits = base12.split('').map(Number);
  const dv = (pesos) => {
    const soma = pesos.reduce((acc, peso, i) => acc + digits[i] * peso, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  digits.push(dv([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  digits.push(dv([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  return digits.join('');
}

/** Depósito no centro de Jaraguá do Sul (origem e destino das rotas). */
const DEPOSITO = {
  depot_street: 'Rua Reinoldo Rau',
  depot_number: '500',
  depot_district: 'Centro',
  depot_city: 'Jaraguá do Sul',
  depot_state: 'SC',
  depot_zip_code: '89251600',
  depot_latitude: -26.4855,
  depot_longitude: -49.0716,
  operation_start_time: '08:00',
  operation_end_time: '18:00',
};

const CLIENTES = [
  ['Marcenaria Vale do Itapocu', 'Rua Walter Marquardt', '1250', 'Barra do Rio Molha', '89259565'],
  ['Móveis Planejados Schroeder', 'Rua Joinville', '3100', 'Vila Lalau', '89256500'],
  ['Casa das Ferragens Baependi', 'Rua Bernardo Dornbusch', '880', 'Baependi', '89256100'],
  ['Armários Nova Brasília', 'Rua Expedicionário Antônio Carlos Ferreira', '410', 'Nova Brasília', '89252220'],
  ['Cozinhas Ilha da Figueira', 'Rua José Theodoro Ribeiro', '2050', 'Ilha da Figueira', '89258000'],
  ['Madeireira Barra do Rio Cerro', 'Rua Ângelo Rubini', '1730', 'Barra do Rio Cerro', '89260100'],
  ['Design de Interiores Centro', 'Rua Barão do Rio Branco', '320', 'Centro', '89251400'],
  ['Marcenaria Amizade', 'Rua Presidente Epitácio Pessoa', '760', 'Centro', '89251100'],
  ['Móveis Sob Medida Czerniewicz', 'Rua Max Wilhelm', '150', 'Czerniewicz', '89255300'],
  ['Estofados Jaraguá Esquerdo', 'Rua Francisco Hruschka', '990', 'Jaraguá Esquerdo', '89253300'],
  ['Portas e Janelas Rau', 'Rua Arthur Gumz', '640', 'Rau', '89254300'],
  ['Ferragens Vila Nova', 'Avenida Marechal Deodoro da Fonseca', '1500', 'Centro', '89251700'],
].map(([name, street, number, neighborhood, zip], i) => ({
  name,
  document: cnpj(`${String(4210 + i).padStart(4, '0')}${String(1000 + i * 7).padStart(4, '0')}0001`),
  type: 'J',
  email: `compras${i + 1}@exemplo-athonis.com.br`,
  phone: `4733${String(700000 + i * 1111).slice(0, 6)}`,
  street,
  number,
  neighborhood,
  city: 'Jaraguá do Sul',
  state: 'SC',
  zip_code: zip,
  status: 'active',
  notes: 'Demonstração (seed-pilot-data)',
}));

const PRODUTOS = [
  ['Perfis de alumínio', 40, 8450],
  ['Dobradiças com amortecedor', 120, 3200.5],
  ['Corrediças telescópicas', 60, 5100],
  ['Puxadores linha premium', 25, 2750.9],
  ['Fechaduras para armário', 200, 2890],
  ['Trilhos para porta de correr', 15, 6300],
  ['Suportes para prateleira', 300, 1150.75],
  ['Chapas de MDF 18 mm', 30, 9800],
];
const JANELAS = [null, '08:00 - 12:00', '13:00 - 17:00', null];
const URGENCIAS = ['normal', 'normal', 'high', 'low', 'critical'];

function dia(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function listar(path) {
  const data = await api('GET', `${path}?limit=500`);
  return Array.isArray(data) ? data : (data?.items ?? []);
}

async function main() {
  const auth = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  token = auth.access_token;
  console.log(`login ok em ${BASE_URL}`);

  const empresa = await api('GET', '/company');
  if (empresa.depot_latitude == null || empresa.depot_longitude == null) {
    await api('PATCH', '/company', DEPOSITO);
    console.log(`depósito: ${DEPOSITO.depot_street}, ${DEPOSITO.depot_number} (${DEPOSITO.depot_city})`);
  } else {
    console.log('depósito já cadastrado, mantido');
  }

  const existentes = new Map((await listar('/clients')).map((c) => [c.document, c]));
  const clientes = [];
  for (const cliente of CLIENTES) {
    let registro = existentes.get(cliente.document);
    if (!registro) {
      registro = await api('POST', '/clients', cliente);
      console.log(`cliente criado: ${cliente.name}`);
    }
    // A listagem não traz todos os campos: o endereço vem daqui, o id de lá.
    clientes.push({ ...cliente, client_id: registro.client_id });
  }

  const pedidos = await listar('/orders');
  const chave = (titulo, data) => `${titulo}|${String(data ?? '').slice(0, 10)}`;
  const jaExiste = new Set(pedidos.map((p) => chave(p.title, p.delivery_date)));

  let criados = 0;
  for (let d = 1; d <= DIAS; d += 1) {
    const data = dia(d);
    // 7 pedidos por dia, cada dia com um grupo diferente de clientes.
    for (let i = 0; i < 7; i += 1) {
      const cliente = clientes[(d * 5 + i) % clientes.length];
      const [produto, quantidade, valor] = PRODUTOS[(d + i) % PRODUTOS.length];
      const titulo = `${produto} — ${cliente.name}`;
      if (jaExiste.has(chave(titulo, data))) continue;
      await api('POST', '/orders', {
        client_id: cliente.client_id,
        title: titulo,
        quantity: quantidade,
        value: valor,
        urgency: URGENCIAS[(d + i) % URGENCIAS.length],
        status: 'pending',
        delivery_date: data,
        delivery_window: JANELAS[(d + i) % JANELAS.length] ?? undefined,
        delivery_street: cliente.street,
        delivery_number: cliente.number,
        delivery_district: cliente.neighborhood,
        delivery_city: cliente.city,
        delivery_state: cliente.state,
        delivery_zipcode: cliente.zip_code,
      });
      criados += 1;
    }
  }

  console.log(`pronto: ${clientes.length} clientes, ${criados} pedidos novos para ${DIAS} dia(s)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
