import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RoutesService } from '../services/routes.service';
import { FindRouteDto } from '../dto/find-route.dto';
import { DuplicateRouteDto } from '../dto/duplicate-route.dto';

/**
 * Rotas de entrega.
 *
 * A criação não fica aqui: uma rota nasce da otimização
 * (`POST /optimization-routes/optimize`). Este controller cuida do ciclo de
 * vida — iniciar, baixar parada, concluir, cancelar e excluir.
 */
@ApiTags('Rotas')
@Controller('routes')
@ApiBearerAuth('JWT-auth')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista as rotas da empresa',
    description: 'Cada rota vem com os pedidos já na ordem das paradas.',
  })
  @ApiResponse({ status: 200, description: 'Rotas encontradas' })
  async findAll(@Query() query: FindRouteDto) {
    return this.routesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de uma rota, com as paradas' })
  @ApiResponse({ status: 404, description: 'Rota não encontrada' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.routesService.findOne(id);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Inicia a rota',
    description:
      'Marca a rota como ativa, os pedidos como "em rota", o motorista como "em rota" e o veículo como "em uso".',
  })
  @ApiResponse({ status: 400, description: 'A rota não está planejada ou não tem pedidos' })
  async start(@Param('id', ParseIntPipe) id: number) {
    return this.routesService.start(id);
  }

  @Post(':id/orders/:orderId/deliver')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Baixa uma parada da rota',
    description:
      'Marca o pedido como entregue. Quando é a última parada pendente, a rota é concluída e o motorista e o veículo voltam a ficar disponíveis.',
  })
  @ApiResponse({ status: 400, description: 'A rota não está em andamento ou a parada já foi baixada' })
  @ApiResponse({ status: 404, description: 'A parada não faz parte desta rota' })
  async deliverStop(
    @Param('id', ParseIntPipe) id: number,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.routesService.deliverStop(id, orderId);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Conclui a rota',
    description:
      'Dá como entregues as paradas que ainda não foram baixadas e libera o motorista e o veículo.',
  })
  @ApiResponse({ status: 400, description: 'A rota não está em andamento' })
  async complete(@Param('id', ParseIntPipe) id: number) {
    return this.routesService.complete(id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancela a rota',
    description:
      'Devolve os pedidos não entregues para a fila e libera o motorista e o veículo, mantendo o registro da rota.',
  })
  @ApiResponse({ status: 400, description: 'A rota já foi concluída' })
  async cancel(@Param('id', ParseIntPipe) id: number) {
    return this.routesService.cancel(id);
  }

  @Post(':id/duplicate')
  @ApiOperation({
    summary: 'Duplica uma rota cancelada',
    description:
      'Cria uma rota planejada com as paradas que a rota cancelada ainda devia, na mesma ordem. ' +
      'Entram só os pedidos que continuam livres na fila. Sem corpo, sai para hoje com o mesmo motorista e veículo.',
  })
  @ApiResponse({ status: 201, description: 'Rota nova, já com as paradas' })
  @ApiResponse({ status: 400, description: 'A rota não está cancelada ou não há paradas livres para duplicar' })
  async duplicate(@Param('id', ParseIntPipe) id: number, @Body() dto: DuplicateRouteDto) {
    return this.routesService.duplicate(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Exclui a rota',
    description:
      'Só é possível excluir uma rota sem entregas concluídas. Os pedidos voltam para a fila.',
  })
  @ApiResponse({ status: 400, description: 'Rota em andamento ou com entregas concluídas' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.routesService.remove(id);
  }
}
