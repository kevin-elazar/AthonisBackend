/**
 * Planilha modelo da importação de pedidos.
 *
 * Os pedidos são fictícios, com endereços em bairros diferentes de Jaraguá do
 * Sul, para demonstrar a roteirização. Motorista e veículo vêm do cadastro da
 * própria empresa (IDs variam de empresa para empresa): com dois pares
 * disponíveis, os pedidos se dividem em duas rotas.
 *
 * Separador ";" e BOM UTF-8: é o formato que o Excel em português abre direto,
 * com os acentos certos. A importação aceita ";" ou "," e ignora o BOM.
 */

export const TEMPLATE_COLUMNS = [
  'client_id',
  'title',
  'description',
  'invoice_number',
  'urgency',
  'vehicle_id',
  'driver_id',
  'quantity',
  'delivery_street',
  'delivery_number',
  'delivery_complement',
  'delivery_district',
  'delivery_city',
  'delivery_state',
  'delivery_zipcode',
] as const;

interface DemoOrder {
  title: string;
  description: string;
  urgency: 'low' | 'normal' | 'high' | 'critical';
  quantity: number;
  street: string;
  number: string;
  complement: string;
  district: string;
  zipcode: string;
}

/** Endereços reais de ruas de Jaraguá do Sul; clientes e mercadorias são fictícios. */
export const DEMO_ORDERS: DemoOrder[] = [
  { title: 'Marcenaria Schmitt', description: 'Corrediças telescópicas 450 mm', urgency: 'high', quantity: 12, street: 'Rua Reinoldo Rau', number: '600', complement: '', district: 'Centro', zipcode: '89251-600' },
  { title: 'Móveis Planejados Kreutzfeld', description: 'Dobradiças com amortecedor', urgency: 'normal', quantity: 30, street: 'Avenida Marechal Deodoro da Fonseca', number: '1200', complement: 'Sala 2', district: 'Centro', zipcode: '89251-700' },
  { title: 'Estofados Vegini', description: 'Puxadores de alumínio', urgency: 'normal', quantity: 8, street: 'Rua Walter Marquardt', number: '1150', complement: '', district: 'Barra do Rio Molha', zipcode: '89259-565' },
  { title: 'Cozinhas Lenzi', description: 'Kits de montagem de gavetas', urgency: 'critical', quantity: 5, street: 'Rua Bernardo Dornbusch', number: '1500', complement: 'Galpão 3', district: 'Baependi', zipcode: '89256-150' },
  { title: 'Ateliê Madeira Nobre', description: 'Pés reguláveis para armários', urgency: 'low', quantity: 40, street: 'Rua Joinville', number: '2500', complement: '', district: 'Vila Lalau', zipcode: '89256-501' },
  { title: 'Marcenaria Ilha', description: 'Trilhos para portas de correr', urgency: 'normal', quantity: 6, street: 'Rua José Theodoro Ribeiro', number: '1800', complement: '', district: 'Ilha da Figueira', zipcode: '89258-000' },
  { title: 'Planejados Grubba', description: 'Corrediças ocultas 500 mm', urgency: 'high', quantity: 20, street: 'Avenida Prefeito Waldemar Grubba', number: '3000', complement: '', district: 'Vila Lenzi', zipcode: '89256-501' },
  { title: 'Móveis Amizade', description: 'Articuladores para portas basculantes', urgency: 'normal', quantity: 10, street: 'Rua Roberto Ziemann', number: '1200', complement: 'Fundos', district: 'Amizade', zipcode: '89255-300' },
  { title: 'Decor Vila Nova', description: 'Cabideiros e acessórios de closet', urgency: 'low', quantity: 15, street: 'Rua Erwino Menegotti', number: '900', complement: '', district: 'Vila Rau', zipcode: '89254-000' },
  { title: 'Marcenaria Rio Cerro', description: 'Dobradiças retas e curvas', urgency: 'normal', quantity: 25, street: 'Rua Henrique Marquardt', number: '250', complement: '', district: 'Barra do Rio Cerro', zipcode: '89260-000' },
];

export interface DriverVehiclePair {
  driverId: number;
  vehicleId: number;
}

export interface TemplateDriver {
  driver_id: number;
  status?: string | null;
}

export interface TemplateVehicle {
  vehicle_id: number;
  status?: string | null;
  driver_id?: number | null;
}

/**
 * Escolhe até `max` pares motorista + veículo para o modelo.
 *
 * Primeiro o veículo com o seu motorista habitual (o vínculo do cadastro);
 * depois os veículos livres com os motoristas que sobraram. Motorista
 * "unavailable" e veículo em manutenção ou inativo ficam de fora, salvo se
 * não houver mais ninguém.
 */
export function pickDriverVehiclePairs(
  drivers: TemplateDriver[],
  vehicles: TemplateVehicle[],
  max = 2,
): DriverVehiclePair[] {
  const preferir = <T>(lista: T[], ok: (item: T) => boolean) => {
    const bons = lista.filter(ok);
    return bons.length ? bons : lista;
  };
  const motoristas = preferir(
    [...drivers].sort((a, b) => a.driver_id - b.driver_id),
    (d) => d.status !== 'unavailable',
  );
  const veiculos = preferir(
    [...vehicles].sort((a, b) => a.vehicle_id - b.vehicle_id),
    (v) => v.status !== 'maintenance' && v.status !== 'inactive',
  );

  const pares: DriverVehiclePair[] = [];
  const usados = new Set<number>();
  const veiculosLivres: TemplateVehicle[] = [];

  for (const veiculo of veiculos) {
    const habitual = motoristas.find((m) => m.driver_id === veiculo.driver_id);
    if (habitual && !usados.has(habitual.driver_id)) {
      pares.push({ driverId: habitual.driver_id, vehicleId: veiculo.vehicle_id });
      usados.add(habitual.driver_id);
    } else {
      veiculosLivres.push(veiculo);
    }
  }
  for (const veiculo of veiculosLivres) {
    const livre = motoristas.find((m) => !usados.has(m.driver_id));
    if (!livre) break;
    pares.push({ driverId: livre.driver_id, vehicleId: veiculo.vehicle_id });
    usados.add(livre.driver_id);
  }
  return pares.slice(0, max);
}

/** Valor seguro numa célula: sem o separador, sem aspas e sem fórmula de planilha. */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/[;"\r\n]/g, ' ').trim();
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

/**
 * Monta o CSV. Sem pares, as colunas de motorista e veículo ficam vazias e a
 * importação recusa as linhas explicando o motivo.
 */
export function buildTemplateCsv(pairs: DriverVehiclePair[], invoiceSeed = 1000): string {
  const linhas = DEMO_ORDERS.map((pedido, index) => {
    // Metade dos pedidos para cada par: duas rotas na demonstração.
    const par = pairs.length ? pairs[Math.floor((index * pairs.length) / DEMO_ORDERS.length)] : null;
    const valores: Record<(typeof TEMPLATE_COLUMNS)[number], string | number> = {
      client_id: '',
      title: pedido.title,
      description: pedido.description,
      invoice_number: `NF-${invoiceSeed + index + 1}`,
      urgency: pedido.urgency,
      vehicle_id: par?.vehicleId ?? '',
      driver_id: par?.driverId ?? '',
      quantity: pedido.quantity,
      delivery_street: pedido.street,
      delivery_number: pedido.number,
      delivery_complement: pedido.complement,
      delivery_district: pedido.district,
      delivery_city: 'Jaraguá do Sul',
      delivery_state: 'SC',
      delivery_zipcode: pedido.zipcode,
    };
    return TEMPLATE_COLUMNS.map((coluna) => cell(valores[coluna])).join(';');
  });

  return `\uFEFF${[TEMPLATE_COLUMNS.join(';'), ...linhas].join('\r\n')}\r\n`;
}

/** Urgência em português também vale na importação ("alta" vira "high"). */
const URGENCIA_PT: Record<string, string> = {
  baixa: 'low',
  normal: 'normal',
  media: 'normal',
  média: 'normal',
  alta: 'high',
  urgente: 'critical',
  critica: 'critical',
  crítica: 'critical',
};

export function normalizeUrgency(value: string | undefined): string | undefined {
  if (!value) return value;
  const texto = value.trim();
  return URGENCIA_PT[texto.toLowerCase()] ?? texto;
}
