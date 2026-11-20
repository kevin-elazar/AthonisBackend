import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { FindAnalyticsDto } from './dto/find-analytics.dto';

/**
 * Painel analítico: o que aconteceu em campo, e como isso se compara ao que
 * a otimização planejou. O período padrão são os últimos 30 dias, pelo dia
 * planejado da rota.
 */
@ApiTags('Indicadores')
@Controller('analytics')
@ApiBearerAuth('JWT-auth')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Indicadores gerais do período' })
  overview(@Query() query: FindAnalyticsDto) {
    return this.analyticsService.overview(query);
  }

  @Get('drivers')
  @ApiOperation({ summary: 'Índice de conclusão e ritmo por motorista' })
  drivers(@Query() query: FindAnalyticsDto) {
    return this.analyticsService.drivers(query);
  }

  @Get('regions')
  @ApiOperation({ summary: 'Tempo de atendimento e atraso por bairro e faixa do dia' })
  regions(@Query() query: FindAnalyticsDto) {
    return this.analyticsService.regions(query);
  }

  @Get('occurrences')
  @ApiOperation({ summary: 'Frequência por tipo de ocorrência e ocorrências recentes' })
  occurrences(@Query() query: FindAnalyticsDto) {
    return this.analyticsService.occurrences(query);
  }

  @Get('routes')
  @ApiOperation({ summary: 'Rotas executadas no período, com o resumo planejado × executado' })
  routes(@Query() query: FindAnalyticsDto) {
    return this.analyticsService.routes(query);
  }

  @Get('live')
  @ApiOperation({
    summary: 'Rotas em andamento, com a última posição conhecida de cada uma',
    description: 'A posição tem o atraso do envio em lotes pelo aplicativo; recorded_at diz de quando é.',
  })
  live() {
    return this.analyticsService.live();
  }

  @Get('routes/:id/comparison')
  @ApiOperation({ summary: 'Planejado × executado de uma rota, parada a parada' })
  @ApiResponse({ status: 404, description: 'Rota não encontrada' })
  comparison(@Param('id', ParseIntPipe) id: number) {
    return this.analyticsService.comparison(id);
  }
}
