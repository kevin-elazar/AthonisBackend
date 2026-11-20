import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AllowDriver } from '../../auth/decorators/allow-driver.decorator';
import { DriverRoutesService } from '../services/driver-routes.service';
import { FindDriverRoutesDto, FindDriverRoutesRangeDto } from '../dto/find-driver-routes.dto';
import {
  CancelRouteDto,
  DeliverStopDto,
  DriverEventDto,
  FailStopDto,
} from '../dto/driver-event.dto';
import { LocationBatchDto } from '../dto/location-batch.dto';
import { Throttle } from '@nestjs/throttler';

/**
 * Limite mais folgado para o rastro de GPS: ao voltar a ter sinal o aplicativo
 * descarrega o rastro acumulado em vários lotes seguidos, e vários motoristas
 * podem sair pelo mesmo IP (NAT da operadora). Os nomes batem com app.module.ts.
 */
const LOCATIONS_THROTTLE = {
  short: { ttl: 1000, limit: 30 },
  medium: { ttl: 10000, limit: 150 },
  long: { ttl: 60000, limit: 600 },
};

/**
 * API do aplicativo do entregador.
 *
 * Só o papel 'driver' entra aqui, e tudo é filtrado pelo motorista do token.
 * As ações recebem `client_event_id`: repetir a chamada com o mesmo valor
 * responde 200 com o estado atual, sem registrar de novo — é o que permite
 * ao aplicativo reenviar com segurança depois de ficar sem sinal.
 */
@ApiTags('Aplicativo do entregador')
@Controller('driver')
@ApiBearerAuth('JWT-auth')
@AllowDriver()
@UseGuards(RolesGuard)
@Roles('driver')
export class DriverAppController {
  constructor(private readonly driverRoutesService: DriverRoutesService) {}

  @Get('me')
  @ApiOperation({ summary: 'Motorista, empresa e fuso do acesso atual' })
  me() {
    return this.driverRoutesService.me();
  }

  @Get('routes')
  @ApiOperation({
    summary: 'Rotas do motorista no dia',
    description:
      'Inclui sempre a rota em andamento, mesmo que planejada para outro dia. Cada rota vem com as paradas em ordem.',
  })
  findRoutes(@Query() query: FindDriverRoutesDto) {
    return this.driverRoutesService.findRoutes(query.date);
  }

  @Get('routes/range')
  @ApiOperation({
    summary: 'Rotas do motorista num período',
    description:
      'Para a tela "Minhas rotas": próximas e anteriores, sem as canceladas, no máximo 62 dias. Cada rota vem com as paradas.',
  })
  findRoutesInRange(@Query() query: FindDriverRoutesRangeDto) {
    return this.driverRoutesService.findRoutesInRange(query.from, query.to);
  }

  @Get('routes/:id')
  @ApiOperation({ summary: 'Detalhe de uma rota do motorista' })
  @ApiResponse({ status: 404, description: 'Rota inexistente ou de outro motorista' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.driverRoutesService.findOne(id);
  }

  @Post('routes/:id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registra a saída para a rota' })
  @ApiResponse({ status: 409, description: 'A rota já foi concluída ou cancelada' })
  start(@Param('id', ParseIntPipe) id: number, @Body() dto: DriverEventDto) {
    return this.driverRoutesService.start(id, dto);
  }

  @Post('routes/:id/stops/:orderId/arrive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registra a chegada a uma parada' })
  @ApiResponse({ status: 409, description: 'Rota fora de andamento ou parada já encerrada' })
  arrive(
    @Param('id', ParseIntPipe) id: number,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: DriverEventDto,
  ) {
    return this.driverRoutesService.arrive(id, orderId, dto);
  }

  @Post('routes/:id/stops/:orderId/deliver')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Baixa uma parada como entregue' })
  @ApiResponse({ status: 409, description: 'Rota fora de andamento ou parada já encerrada' })
  deliver(
    @Param('id', ParseIntPipe) id: number,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: DeliverStopDto,
  ) {
    return this.driverRoutesService.deliver(id, orderId, dto);
  }

  @Post('routes/:id/stops/:orderId/fail')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registra uma ocorrência: parada visitada e não entregue' })
  @ApiResponse({ status: 409, description: 'Rota fora de andamento ou parada já encerrada' })
  fail(
    @Param('id', ParseIntPipe) id: number,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: FailStopDto,
  ) {
    return this.driverRoutesService.fail(id, orderId, dto);
  }

  @Post('routes/:id/finish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Encerra a rota',
    description:
      'Exige que toda parada tenha baixa ou ocorrência. Dispara a consolidação da comparação planejado × executado.',
  })
  @ApiResponse({ status: 400, description: 'Há paradas sem baixa (errors lista quais)' })
  finish(@Param('id', ParseIntPipe) id: number, @Body() dto: DriverEventDto) {
    return this.driverRoutesService.finish(id, dto);
  }

  @Post('routes/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancela a rota em andamento',
    description:
      'As paradas ainda abertas voltam para a fila de pedidos e o motorista e o veículo são liberados. O motivo é obrigatório.',
  })
  @ApiResponse({ status: 409, description: 'A rota não está em andamento' })
  cancel(@Param('id', ParseIntPipe) id: number, @Body() dto: CancelRouteDto) {
    return this.driverRoutesService.cancel(id, dto);
  }

  @Post('routes/:id/locations')
  @HttpCode(HttpStatus.OK)
  @Throttle(LOCATIONS_THROTTLE)
  @ApiOperation({
    summary: 'Envia um lote do rastro de GPS',
    description: 'Até 200 pontos por chamada. Pontos repetidos são ignorados.',
  })
  recordLocations(@Param('id', ParseIntPipe) id: number, @Body() dto: LocationBatchDto) {
    return this.driverRoutesService.recordLocations(id, dto);
  }
}
