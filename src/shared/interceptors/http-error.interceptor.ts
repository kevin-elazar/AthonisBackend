import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class HttpErrorInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HttpErrorInterceptor');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError(error => {
        this.logger.error('Error during request processing:', error);
        
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