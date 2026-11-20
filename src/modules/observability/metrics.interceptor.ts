import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

/** Mede cada requisição HTTP e registra no MetricsService. */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const route: string = request.route?.path ?? 'desconhecida';
    if (route === '/metrics' || route === '/health') {
      return next.handle();
    }

    const start = process.hrtime.bigint();
    const record = (status: number) => {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.observeRequest(request.method, route, status, seconds);
    };

    return next.handle().pipe(
      tap({
        next: () => record(response.statusCode),
        error: (error: { status?: number; getStatus?: () => number }) =>
          record(error?.getStatus?.() ?? error?.status ?? 500),
      }),
    );
  }
}
