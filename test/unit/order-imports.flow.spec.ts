import { BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { OrderImportsService } from '@/modules/order-imports/services/order-imports.service';

/**
 * Fluxo completo da importação de pedidos por CSV, com arquivos de verdade
 * numa pasta temporária: detecção do separador, validação do cabeçalho,
 * validação linha a linha, gravação parcial e arquivo de rejeição.
 */
describe('OrderImportsService (fluxo de importação)', () => {
  const ID_COMPANY = 7;
  let root: string;
  let service: OrderImportsService;
  let ordersService: { create: jest.Mock };

  const HEADER =
    'client_id,title,urgency,quantity,delivery_street,delivery_district,delivery_city,delivery_state,delivery_zipcode,delivery_number,vehicle_id,driver_id';

  const linha = (campos: Partial<Record<string, string | number>>) => {
    const base: Record<string, string | number> = {
      client_id: 1,
      title: 'Dobradiças',
      urgency: 'normal',
      quantity: 10,
      delivery_street: 'Rua Walter Marquardt',
      delivery_district: 'Barra do Rio Molha',
      delivery_city: 'Jaraguá do Sul',
      delivery_state: 'SC',
      delivery_zipcode: '89250-000',
      delivery_number: '1548',
      vehicle_id: '',
      driver_id: '',
      ...campos,
    };
    return HEADER.split(',')
      .map((coluna) => base[coluna] ?? '')
      .join(',');
  };

  const arquivo = (conteudo: string, nome = 'pedidos.csv', mimetype = 'text/csv') => ({
    originalname: nome,
    mimetype,
    buffer: Buffer.from(conteudo, 'utf-8'),
  });

  const rejeicao = async (nome: string) =>
    fs.readFile(path.join(root, String(ID_COMPANY), 'rejeicao', nome), 'utf-8');

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'athonis-import-'));
    ordersService = {
      create: jest.fn(async (dto) => ({ order_id: Math.floor(Math.random() * 1000), title: dto.title })),
    };
    const repo = (ids: Record<string, number>[]) => ({ find: jest.fn().mockResolvedValue(ids) });

    service = new OrderImportsService(
      repo([{ client_id: 1 }, { client_id: 2 }]) as any,
      repo([{ vehicle_id: 5 }]) as any,
      repo([{ driver_id: 9 }]) as any,
      ordersService as any,
      { getIdCompany: () => ID_COMPANY } as any,
    );
    Object.defineProperty(service, 'uploadsRoot', { value: root });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('importa tudo quando todas as linhas são válidas', async () => {
    const csv = [HEADER, linha({}), linha({ client_id: 2, vehicle_id: 5, driver_id: 9 })].join('\n');

    const resultado = await service.importOrders(arquivo(csv));

    expect(resultado.status).toBe('SUCESSO_TOTAL');
    expect(resultado.totalLinhas).toBe(2);
    expect(resultado.quantidadeSucessos).toBe(2);
    expect(resultado.arquivoRejeicao).toBeUndefined();
    expect(ordersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: 2, vehicle_id: 5, driver_id: 9, quantity: 10 }),
    );
    // O arquivo original fica guardado na pasta da empresa, com nome gerado no servidor.
    const guardados = await fs.readdir(path.join(root, String(ID_COMPANY)));
    expect(guardados.some((nome) => /^pedidos_\d{8}_\d{6}\.csv$/.test(nome))).toBe(true);
  });

  it('aceita CSV separado por ponto e vírgula (padrão do Excel em português)', async () => {
    const csv = [HEADER, linha({})].map((l) => l.replace(/,/g, ';')).join('\n');

    const resultado = await service.importOrders(arquivo(csv));

    expect(resultado.status).toBe('SUCESSO_TOTAL');
    expect(ordersService.create).toHaveBeenCalledTimes(1);
  });

  it('importa as linhas boas e manda as ruins para o arquivo de rejeição', async () => {
    const csv = [
      HEADER,
      linha({}),
      linha({ client_id: 99 }), // cliente de outra empresa
      linha({ urgency: 'urgentissima', vehicle_id: 77 }), // urgência inválida e veículo inexistente
      linha({ title: '=1+1' }), // fórmula: precisa ser neutralizada na rejeição
    ].join('\n');
    ordersService.create.mockImplementation(async (dto) => {
      if (dto.title.startsWith('=')) throw new Error('Título recusado pelo banco');
      return { order_id: 1, title: dto.title };
    });

    const resultado = await service.importOrders(arquivo(csv, 'Lote de Novembro.csv'));

    expect(resultado.status).toBe('SUCESSO_PARCIAL');
    expect(resultado.totalLinhas).toBe(4);
    expect(resultado.quantidadeSucessos).toBe(1);
    expect(resultado.quantidadeFalhas).toBe(3);

    const porLinha = Object.fromEntries(resultado.falhas.map((f) => [f.linha, f.erros.join(' | ')]));
    expect(porLinha[3]).toContain('Cliente com ID 99 não existe');
    expect(porLinha[4]).toContain('Urgência deve ser uma de');
    expect(porLinha[4]).toContain('Veículo com ID 77 não existe');
    expect(porLinha[5]).toContain('Título recusado pelo banco');

    // Nome de arquivo saneado e conteúdo sem fórmula executável.
    expect(resultado.arquivoRejeicao).toMatch(/^REJEICAO_Lote_de_Novembro_\d{8}_\d{6}\.csv$/);
    const conteudo = await rejeicao(resultado.arquivoRejeicao!);
    expect(conteudo).toContain('motivo_rejeicao');
    expect(conteudo).toContain("'=1+1");
    expect(conteudo).not.toMatch(/(^|,)=1\+1/m);
  });

  it('informa falha total quando nenhuma linha passa', async () => {
    const csv = [HEADER, linha({ client_id: 50 }), linha({ quantity: '' })].join('\n');

    const resultado = await service.importOrders(arquivo(csv));

    expect(resultado.status).toBe('FALHA_TOTAL');
    expect(resultado.quantidadeSucessos).toBe(0);
    expect(resultado.mensagem).toContain('Todas as 2 linhas contêm erros');
    expect(ordersService.create).not.toHaveBeenCalled();
  });

  it('recusa arquivo que não é CSV', async () => {
    await expect(service.importOrders(arquivo('x', 'pedidos.xlsx'))).rejects.toThrow(
      'Apenas arquivos CSV são permitidos',
    );
    await expect(service.importOrders(arquivo('x', 'pedidos.csv', 'application/pdf'))).rejects.toThrow(
      'Tipo de arquivo inválido',
    );
  });

  it('recusa CSV sem as colunas obrigatórias, dizendo quais faltam', async () => {
    const csv = 'client_id,title,urgency\n1,Teste,normal';

    await expect(service.importOrders(arquivo(csv))).rejects.toThrow(
      /Colunas obrigatórias faltando no CSV: quantity, delivery_street/,
    );
  });

  it('recusa CSV vazio', async () => {
    await expect(service.importOrders(arquivo(''))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('não cria arquivo de rejeição quando não há rejeitados', async () => {
    await expect(service.saveRejectedRows([], 'x.csv')).resolves.toBeNull();
  });

  it('converte erro inesperado em erro interno sem vazar detalhe', async () => {
    Object.defineProperty(service, 'uploadsRoot', { value: '\u0000caminho-invalido' });

    await expect(service.importOrders(arquivo([HEADER, linha({})].join('\n')))).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  describe('arquivos de rejeição', () => {
    const criar = async (nome: string, quando: Date, conteudo = 'linha\n1') => {
      const dir = path.join(root, String(ID_COMPANY), 'rejeicao');
      await fs.mkdir(dir, { recursive: true });
      const caminho = path.join(dir, nome);
      await fs.writeFile(caminho, conteudo);
      await fs.utimes(caminho, quando, quando);
      return caminho;
    };

    it('lista só os arquivos de rejeição, do mais novo para o mais antigo', async () => {
      await criar('REJEICAO_a.csv', new Date(2026, 9, 1, 10));
      await criar('REJEICAO_b.csv', new Date(2026, 9, 20, 10), 'x'.repeat(2048));
      await criar('outro.csv', new Date(2026, 9, 21, 10));

      const lista = await service.listRejectedFiles();

      expect(lista.total).toBe(2);
      expect(lista.files.map((f) => f.filename)).toEqual(['REJEICAO_b.csv', 'REJEICAO_a.csv']);
      expect(lista.files[0].sizeFormatted).toBe('2 KB');
    });

    it('filtra por período, incluindo o dia inicial e o final', async () => {
      await criar('REJEICAO_set.csv', new Date(2026, 8, 30, 12));
      await criar('REJEICAO_out.csv', new Date(2026, 9, 15, 23));
      await criar('REJEICAO_nov.csv', new Date(2026, 10, 2, 8));

      const so = await service.listRejectedFiles({ dataInicio: '2026-10-01', dataFim: '2026-10-31' });
      expect(so.files.map((f) => f.filename)).toEqual(['REJEICAO_out.csv']);

      const desde = await service.listRejectedFiles({ dataInicio: '2026-10-15' });
      expect(desde.files.map((f) => f.filename)).toEqual(['REJEICAO_nov.csv', 'REJEICAO_out.csv']);

      const ate = await service.listRejectedFiles({ dataFim: '2026-09-30' });
      expect(ate.files.map((f) => f.filename)).toEqual(['REJEICAO_set.csv']);
    });

    it('entrega o caminho de um arquivo da própria empresa e barra os demais', async () => {
      const caminho = await criar('REJEICAO_ok.csv', new Date());

      await expect(service.getRejectedFilePath('REJEICAO_ok.csv')).resolves.toBe(path.resolve(caminho));
      await expect(service.getRejectedFilePath('../7/REJEICAO_ok.csv')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.getRejectedFilePath('')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.getRejectedFilePath('REJEICAO_nao_existe.csv')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
