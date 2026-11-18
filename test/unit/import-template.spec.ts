import {
  DEMO_ORDERS,
  TEMPLATE_COLUMNS,
  buildTemplateCsv,
  normalizeUrgency,
} from '@/modules/order-imports/import-template';

/**
 * A planilha modelo precisa ser importável como veio: o cabeçalho que a
 * importação exige, urgências aceitas pela API e motorista/veículo da empresa.
 */
describe('planilha modelo da importação', () => {
  const linhas = (csv: string) => csv.replace(/^\uFEFF/, '').trim().split('\r\n');

  it('10 pedidos em Jaraguá do Sul, separados por ";", com BOM para o Excel', () => {
    const csv = buildTemplateCsv([{ driverId: 7, vehicleId: 3 }]);
    expect(csv.startsWith('\uFEFF')).toBe(true);

    const [cabecalho, ...pedidos] = linhas(csv);
    expect(cabecalho.split(';')).toEqual([...TEMPLATE_COLUMNS]);
    expect(pedidos).toHaveLength(10);

    const campos = pedidos.map((linha) => linha.split(';'));
    const coluna = (nome: (typeof TEMPLATE_COLUMNS)[number]) => TEMPLATE_COLUMNS.indexOf(nome);
    for (const valores of campos) {
      expect(valores).toHaveLength(TEMPLATE_COLUMNS.length);
      expect(valores[coluna('delivery_city')]).toBe('Jaraguá do Sul');
      expect(valores[coluna('delivery_state')]).toBe('SC');
      expect(['low', 'normal', 'high', 'critical']).toContain(valores[coluna('urgency')]);
      expect(valores[coluna('driver_id')]).toBe('7');
      expect(valores[coluna('vehicle_id')]).toBe('3');
    }
    // Bairros diferentes: a rota tem o que otimizar.
    expect(new Set(campos.map((v) => v[coluna('delivery_district')])).size).toBeGreaterThanOrEqual(8);
  });

  it('com dois pares, divide os pedidos ao meio (duas rotas)', () => {
    const csv = buildTemplateCsv([
      { driverId: 1, vehicleId: 10 },
      { driverId: 2, vehicleId: 20 },
    ]);
    const motoristas = linhas(csv)
      .slice(1)
      .map((linha) => linha.split(';')[TEMPLATE_COLUMNS.indexOf('driver_id')]);
    expect(motoristas.filter((m) => m === '1')).toHaveLength(5);
    expect(motoristas.filter((m) => m === '2')).toHaveLength(5);
  });

  it('sem motorista ou veículo cadastrado, as colunas ficam vazias', () => {
    const [, primeira] = linhas(buildTemplateCsv([]));
    const valores = primeira.split(';');
    expect(valores[TEMPLATE_COLUMNS.indexOf('driver_id')]).toBe('');
    expect(valores[TEMPLATE_COLUMNS.indexOf('vehicle_id')]).toBe('');
  });

  it('nenhum texto quebra a coluna nem vira fórmula', () => {
    for (const pedido of DEMO_ORDERS) {
      expect(`${pedido.title}${pedido.description}${pedido.street}`).not.toMatch(/[;"\n]/);
    }
  });

  it.each([
    ['alta', 'high'],
    ['Baixa', 'low'],
    ['URGENTE', 'critical'],
    ['média', 'normal'],
    ['high', 'high'],
    [' normal ', 'normal'],
  ])('urgência "%s" vira "%s"', (entrada, esperado) => {
    expect(normalizeUrgency(entrada)).toBe(esperado);
  });

  it('urgência vazia continua vazia (a validação acusa)', () => {
    expect(normalizeUrgency(undefined)).toBeUndefined();
    expect(normalizeUrgency('')).toBe('');
  });
});
