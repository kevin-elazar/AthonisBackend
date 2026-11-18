import { BadRequestException, CallHandler, ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import { lastValueFrom, throwError } from 'rxjs';
import { HttpErrorInterceptor } from '@/shared/interceptors/http-error.interceptor';
import { parseTrustProxy } from '@/config/env.config';

/**
 * O log de erro não pode carregar dado pessoal (LGPD): um 4xx é rotina do
 * cliente e vai como aviso de uma linha, sem corpo; 5xx segue como erro.
 */
describe('HttpErrorInterceptor', () => {
  const contexto = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'POST',
        path: '/auth/login',
        url: '/auth/login?email=fulano@exemplo.com',
        body: { email: 'fulano@exemplo.com', password: 'segredo' },
      }),
    }),
  } as unknown as ExecutionContext;

  const falhaCom = (erro: unknown): CallHandler => ({ handle: () => throwError(() => erro) });

  let interceptor: HttpErrorInterceptor;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    interceptor = new HttpErrorInterceptor();
    warn = jest.spyOn((interceptor as any).logger, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn((interceptor as any).logger, 'error').mockImplementation(() => undefined);
  });

  it('4xx vira aviso de uma linha, sem corpo nem query string', async () => {
    const excecao = new BadRequestException({ message: 'Falha na validação', errors: [] });

    await expect(lastValueFrom(interceptor.intercept(contexto, falhaCom(excecao)))).rejects.toBe(excecao);

    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]).toHaveLength(1);
    expect(warn.mock.calls[0][0]).toBe('POST /auth/login -> 400: Falha na validação');
    expect(warn.mock.calls[0][0]).not.toContain('fulano');
  });

  it('5xx continua como erro, com a pilha', async () => {
    const excecao = new InternalServerErrorException('Banco fora');

    await expect(lastValueFrom(interceptor.intercept(contexto, falhaCom(excecao)))).rejects.toBe(excecao);

    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('POST /auth/login -> 500: Banco fora', excecao.stack);
  });

  it('erro inesperado é erro e vira resposta 500', async () => {
    const resultado = lastValueFrom(interceptor.intercept(contexto, falhaCom(new Error('quebrou'))));

    await expect(resultado).rejects.toMatchObject({ statusCode: 500, message: 'quebrou' });
    expect(error).toHaveBeenCalledTimes(1);
  });
});

describe('parseTrustProxy', () => {
  it.each([
    [undefined, true, 1],
    [undefined, false, false],
    ['', true, 1],
    ['false', true, false],
    ['true', false, true],
    ['2', false, 2],
    ['loopback, 10.0.0.0/8', true, 'loopback, 10.0.0.0/8'],
  ])('TRUST_PROXY=%p (produção=%p) → %p', (raw, producao, esperado) => {
    expect(parseTrustProxy(raw as string | undefined, producao as boolean)).toEqual(esperado);
  });
});
