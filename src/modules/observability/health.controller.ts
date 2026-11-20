import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Verificação de saúde usada pelo Docker (healthcheck), pelo Caddy e pelo
 * monitoramento. Responde 200 com o banco acessível e 503 quando não.
 */
@ApiTags('Observabilidade')
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  check() {
    return this.health.check([() => this.db.pingCheck('database', { timeout: 3000 })]);
  }
}
