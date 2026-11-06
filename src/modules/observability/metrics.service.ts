import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Métricas no formato do Prometheus.
 *
 * Além das métricas padrão do processo Node (memória, CPU, event loop), conta
 * as requisições HTTP por método, rota e status, e mede a latência. O rótulo
 * de rota usa o padrão do Nest (`/driver/routes/:id`), nunca a URL com IDs,
 * para não criar uma série por registro.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpRequests = new Counter({
    name: 'athonis_http_requests_total',
    help: 'Requisições HTTP recebidas',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [this.registry],
  });

  readonly httpDuration = new Histogram({
    name: 'athonis_http_request_duration_seconds',
    help: 'Tempo de resposta das requisições HTTP',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [this.registry],
  });

  constructor() {
    this.registry.setDefaultLabels({ app: 'athonis-api' });
    collectDefaultMetrics({ register: this.registry, prefix: 'athonis_' });
  }

  observeRequest(method: string, route: string, status: number, seconds: number): void {
    const labels = { method, route, status: String(status) };
    this.httpRequests.inc(labels);
    this.httpDuration.observe(labels, seconds);
  }
}
