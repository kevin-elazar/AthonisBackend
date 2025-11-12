import {
  Controller,
  Get,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { OptimizedRoutesHistoryService } from '../services/optimized-routes-history.service';
import { OptimizedRouteHistoryResponseDto } from '../dto/optimized-route-history-response.dto';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';

@ApiTags('Histórico de Rotas Otimizadas')
@Controller('optimized-routes-history')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class OptimizedRoutesHistoryController {
  constructor(
    private readonly historyService: OptimizedRoutesHistoryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista todos os históricos de rotas otimizadas' })
  @ApiResponse({
    status: 200,
    description: 'Lista de históricos retornada com sucesso',
    type: [OptimizedRouteHistoryResponseDto],
  })
  async findAll(): Promise<OptimizedRouteHistoryResponseDto[]> {
    return this.historyService.findAll();
  }

  @Get('by-order-ids')
  @ApiOperation({ summary: 'Busca históricos por IDs de pedidos' })
  @ApiQuery({
    name: 'orderIds',
    description: 'IDs dos pedidos separados por vírgula',
    example: '1,2,3',
  })
  @ApiResponse({
    status: 200,
    description: 'Históricos encontrados',
    type: [OptimizedRouteHistoryResponseDto],
  })
  async findByOrderIds(
    @Query('orderIds') orderIdsString: string,
  ): Promise<OptimizedRouteHistoryResponseDto[]> {
    const orderIds = orderIdsString.split(',').map(id => parseInt(id.trim(), 10));
    return this.historyService.findByOrderIds(orderIds);
  }

  @Get('by-date-range')
  @ApiOperation({ summary: 'Busca históricos por período' })
  @ApiQuery({
    name: 'startDate',
    description: 'Data inicial (ISO 8601)',
    example: '2024-01-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'endDate',
    description: 'Data final (ISO 8601)',
    example: '2024-01-31T23:59:59.999Z',
  })
  @ApiResponse({
    status: 200,
    description: 'Históricos encontrados',
    type: [OptimizedRouteHistoryResponseDto],
  })
  async findByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<OptimizedRouteHistoryResponseDto[]> {
    return this.historyService.findByDateRange(
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca um histórico específico por ID' })
  @ApiParam({ name: 'id', description: 'ID do histórico', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Histórico encontrado',
    type: OptimizedRouteHistoryResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Histórico não encontrado' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<OptimizedRouteHistoryResponseDto> {
    return this.historyService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um histórico de rota' })
  @ApiParam({ name: 'id', description: 'ID do histórico', example: 1 })
  @ApiResponse({ status: 204, description: 'Histórico removido com sucesso' })
  @ApiResponse({ status: 404, description: 'Histórico não encontrado' })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.historyService.remove(id);
  }
}

