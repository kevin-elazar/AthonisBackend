import { Injectable, NestInterceptor, ExecutionContext, CallHandler, HttpException, Logger } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class HttpErrorInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HttpErrorInterceptor');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError(error => {
        this.logger.error('Error during request processing:', error);

        // Um HttpException segue intacto para o HttpExceptionFilter, que e quem
        // monta a resposta. Convertido aqui em objeto comum, ele deixava de ser
        // reconhecido pelo filtro e a lista `errors` (campo a campo) se perdia
        // antes de chegar ao cliente.
        if (error instanceof HttpException) {
          return throwError(() => error);
        }

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
}