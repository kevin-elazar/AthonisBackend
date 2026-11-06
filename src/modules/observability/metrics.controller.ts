import { Controller, Get, Header, Headers, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { MetricsService } from './metrics.service';

/**
 * Endpoint lido pelo Prometheus.
 *
 * Em produção o proxy (Caddy) não encaminha /metrics para a internet: só o
 * Prometheus, na rede interna do Docker, alcança a API. Se METRICS_TOKEN
 * estiver definido, o token também é exigido, como segunda barreira.
 */
@ApiExcludeController()
@Controller('metrics')
@SkipThrottle()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Public()
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async scrape(@Headers('authorization') authorization?: string): Promise<string> {
    const token = process.env.METRICS_TOKEN;
    if (token && authorization !== `Bearer ${token}`) {
      throw new UnauthorizedException();
    }
    return this.metrics.registry.metrics();
  }
}
