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
import { FindDriverRoutesDto } from '../dto/find-driver-routes.dto';
import { DeliverStopDto, DriverEventDto, FailStopDto } from '../dto/driver-event.dto';
import { LocationBatchDto } from '../dto/location-batch.dto';

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

  @Post('routes/:id/locations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Envia um lote do rastro de GPS',
    description: 'Até 200 pontos por chamada. Pontos repetidos são ignorados.',
  })
  recordLocations(@Param('id', ParseIntPipe) id: number, @Body() dto: LocationBatchDto) {
    return this.driverRoutesService.recordLocations(id, dto);
  }
}
