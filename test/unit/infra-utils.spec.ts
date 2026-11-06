import { BadRequestException, CallHandler, ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import * as Sentry from '@sentry/nestjs';
import { plannedArrivalsByOrder } from '@/shared/domain/planned-arrivals';
import { containsInsensitive, decimalTransformer } from '@/database/column-types';
import { buildDataSourceOptions } from '@/config/database.config';
import { HttpErrorInterceptor } from '@/shared/interceptors/http-error.interceptor';
import { MetricsService } from '@/modules/observability/metrics.service';
import { MetricsInterceptor } from '@/modules/observability/metrics.interceptor';
import { MetricsController } from '@/modules/observability/metrics.controller';

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

describe('plannedArrivalsByOrder', () => {
  it('junta a chegada prevista de todas as rotas e paradas dos históricos', () => {
    const historico = JSON.stringify({
      routes: [
        { stops: [{ orderId: 10, estimatedArrivalTime: '2026-11-05T11:00:00Z' }] },
        { stops: [{ orderId: '11', estimatedArrivalTime: '2026-11-05T12:30:00Z' }, { orderId: 12 }] },
      ],
    });

    const chegadas = plannedArrivalsByOrder([{ optimization_result: historico }]);

    expect(Object.fromEntries(chegadas)).toEqual({
      10: '2026-11-05T11:00:00Z',
      11: '2026-11-05T12:30:00Z',
    });
  });

  it('ignora histórico vazio ou ilegível em vez de derrubar a rota', () => {
    const chegadas = plannedArrivalsByOrder([
      { optimization_result: null },
      { optimization_result: '{json quebrado' },
      { optimization_result: JSON.stringify({ routes: [{ stops: null }] }) },
    ]);

    expect(chegadas.size).toBe(0);
  });
});

describe('tipos de coluna portáveis', () => {
  it('devolve numeric do PostgreSQL como número', () => {
    expect(decimalTransformer.from('-26.4851000')).toBeCloseTo(-26.4851);
    expect(decimalTransformer.from(null)).toBeNull();
    expect(decimalTransformer.from(undefined)).toBeUndefined();
    expect(decimalTransformer.to(12.5)).toBe(12.5);
  });

  it('usa LIKE no SQLite e ILIKE no PostgreSQL para busca sem caixa', () => {
    const original = process.env.DB_TYPE;
    try {
      process.env.DB_TYPE = 'sqlite';
      expect(containsInsensitive('weege')).toMatchObject({ type: 'like', value: '%weege%' });
      process.env.DB_TYPE = 'postgres';
      expect(containsInsensitive('weege')).toMatchObject({ type: 'ilike', value: '%weege%' });
    } finally {
      process.env.DB_TYPE = original;
    }
  });
});

describe('buildDataSourceOptions', () => {
  const ambiente = { ...process.env };
  afterEach(() => {
    process.env = { ...ambiente };
  });

  it('em PostgreSQL usa migrations, nunca synchronize', () => {
    process.env.DB_TYPE = 'postgres';
    process.env.DB_HOST = 'db';
    process.env.DB_NAME = 'athonis';
    delete process.env.DATABASE_URL;
    delete process.env.DB_DROP_SCHEMA;
    delete process.env.DB_MIGRATIONS_RUN;

    const opcoes = buildDataSourceOptions() as any;

    expect(opcoes).toMatchObject({ type: 'postgres', host: 'db', database: 'athonis', synchronize: false });
    expect(opcoes.migrationsRun).toBe(true);
    expect(opcoes.dropSchema).toBe(false);
  });

  it('aceita DATABASE_URL e TLS para banco gerenciado', () => {
    process.env.DB_TYPE = 'postgres';
    process.env.DATABASE_URL = 'postgres://u:p@host:5432/athonis';
    process.env.DB_SSL = 'true';
    process.env.DB_MIGRATIONS_RUN = 'false';

    const opcoes = buildDataSourceOptions() as any;

    expect(opcoes.url).toBe('postgres://u:p@host:5432/athonis');
    expect(opcoes.ssl).toEqual({ rejectUnauthorized: false });
    expect(opcoes.migrationsRun).toBe(false);
  });

  it('SQLite só em memória e com o esquema criado na hora (testes)', () => {
    process.env.DB_TYPE = 'sqlite';
    delete process.env.DB_NAME;

    expect(buildDataSourceOptions()).toMatchObject({ type: 'sqlite', database: ':memory:', synchronize: true });
  });
});

describe('HttpErrorInterceptor', () => {
  const interceptor = new HttpErrorInterceptor();
  const contexto = {} as ExecutionContext;
  const falhando = (erro: unknown): CallHandler => ({ handle: () => throwError(() => erro) });

  beforeEach(() => jest.clearAllMocks());

  it('deixa passar a resposta normal', async () => {
    await expect(lastValueFrom(interceptor.intercept(contexto, { handle: () => of({ ok: true }) }))).resolves.toEqual({
      ok: true,
    });
  });

  it('erro de validação segue intacto e não vai para o Sentry', async () => {
    const erro = new BadRequestException('dados inválidos');
    await expect(lastValueFrom(interceptor.intercept(contexto, falhando(erro)))).rejects.toBe(erro);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('erro 5xx do Nest é reportado ao Sentry', async () => {
    const erro = new InternalServerErrorException();
    await expect(lastValueFrom(interceptor.intercept(contexto, falhando(erro)))).rejects.toBe(erro);
    expect(Sentry.captureException).toHaveBeenCalledWith(erro);
  });

  it('erro inesperado vira resposta padronizada e é reportado', async () => {
    const erro = new Error('conexão recusada');
    await expect(lastValueFrom(interceptor.intercept(contexto, falhando(erro)))).rejects.toMatchObject({
      statusCode: 500,
      success: false,
      message: 'conexão recusada',
      errors: [],
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(erro);
  });
});

describe('métricas (Prometheus)', () => {
  const contextoHttp = (rota: string | undefined, status = 200) =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', route: rota ? { path: rota } : undefined }),
        getResponse: () => ({ statusCode: status }),
      }),
    }) as unknown as ExecutionContext;

  it('conta a requisição pelo padrão da rota, não pela URL com id', async () => {
    const metrics = new MetricsService();
    const interceptor = new MetricsInterceptor(metrics);

    await lastValueFrom(interceptor.intercept(contextoHttp('/driver/routes/:id'), { handle: () => of('ok') }));
    await expect(
      lastValueFrom(
        interceptor.intercept(contextoHttp('/driver/routes/:id'), {
          handle: () => throwError(() => new BadRequestException()),
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const texto = await metrics.registry.metrics();
    expect(texto).toContain('athonis_http_requests_total{method="GET",route="/driver/routes/:id",status="200"');
    expect(texto).toContain('athonis_http_requests_total{method="GET",route="/driver/routes/:id",status="400"');
  });

  it('não mede o próprio /metrics nem /health, nem chamadas fora de HTTP', async () => {
    const metrics = new MetricsService();
    const interceptor = new MetricsInterceptor(metrics);
    const espiao = jest.spyOn(metrics, 'observeRequest');

    await lastValueFrom(interceptor.intercept(contextoHttp('/health'), { handle: () => of('ok') }));
    await lastValueFrom(interceptor.intercept(contextoHttp('/metrics'), { handle: () => of('ok') }));
    await lastValueFrom(
      interceptor.intercept({ getType: () => 'rpc' } as unknown as ExecutionContext, { handle: () => of('ok') }),
    );

    expect(espiao).not.toHaveBeenCalled();
  });

  it('exige o token quando METRICS_TOKEN está definido', async () => {
    const controller = new MetricsController(new MetricsService());
    const original = process.env.METRICS_TOKEN;
    try {
      process.env.METRICS_TOKEN = 'segredo';
      await expect(controller.scrape()).rejects.toThrow();
      await expect(controller.scrape('Bearer segredo')).resolves.toContain('athonis_');
      delete process.env.METRICS_TOKEN;
      await expect(controller.scrape()).resolves.toContain('athonis_');
    } finally {
      process.env.METRICS_TOKEN = original;
    }
  });
});
