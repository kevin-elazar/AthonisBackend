import { Injectable, NestInterceptor, ExecutionContext, CallHandler, HttpException, Logger } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import * as Sentry from '@sentry/nestjs';

@Injectable()
export class HttpErrorInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HttpErrorInterceptor');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError(error => {
        this.log(context, error);

        // Um HttpException segue intacto para o HttpExceptionFilter, que e quem
        // monta a resposta. Convertido aqui em objeto comum, ele deixava de ser
        // reconhecido pelo filtro e a lista `errors` (campo a campo) se perdia
        // antes de chegar ao cliente.
        if (error instanceof HttpException) {
          if (error.getStatus() >= 500) {
            Sentry.captureException(error);
          }
          return throwError(() => error);
        }

        // Erro inesperado: vai para o Sentry (sem efeito se SENTRY_DSN não existir).
        Sentry.captureException(error);

        return throwError(() => ({
          statusCode: error.status || 500,
          success: false,
          message: error.message || 'Erro interno do servidor',
          errors: error.response?.errors || [],
          timestamp: new Date().toISOString()
        }));
      }),
    );
  }

  /**
   * 4xx é erro do cliente (validação, credencial, conflito): vai como aviso,
   * em uma linha, só com método, caminho (sem query string), status e
   * mensagem. Nada do corpo da requisição nem do objeto da exceção, que
   * carregam dado pessoal (LGPD). 5xx e erro inesperado continuam como erro,
   * com a pilha, para investigação.
   */
  private log(context: ExecutionContext, error: any): void {
    const status: number =
      error instanceof HttpException ? error.getStatus() : Number(error?.status) || 500;
    // O log nunca pode mascarar o erro original: contexto incompleto vira rota vazia.
    const request = context?.getType?.() === 'http' ? context.switchToHttp().getRequest() : undefined;
    const rota = request ? `${request.method} ${request.path ?? String(request.url ?? '').split('?')[0]}` : '';

    if (status < 500) {
      const message = error instanceof HttpException ? error.message : 'Requisição recusada';
      this.logger.warn(`${rota} -> ${status}: ${message}`);
      return;
    }

    this.logger.error(`${rota} -> ${status}: ${error?.message ?? 'erro'}`, error?.stack);
  }
}
