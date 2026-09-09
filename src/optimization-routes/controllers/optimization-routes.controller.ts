import { Controller, Post, Body, Logger, HttpException, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { OptimizationRoutesService } from '../services/optimization-routes.service';
import { OptimizeRoutesDto } from '../dto/optimize-routes.dto';
import { OptimizationResultDto } from '../dto/optimization-result.dto';
@ApiTags('Otimização de Rotas')
@Controller('optimization-routes')
@ApiBearerAuth('JWT-auth')
export class OptimizationRoutesController {
  private readonly logger = new Logger(OptimizationRoutesController.name);

  constructor(
    private readonly optimizationRoutesService: OptimizationRoutesService
  ) {}

  @Post('optimize')
  @ApiOperation({ 
    summary: 'Otimizar rotas para uma lista de pedidos',
    description: 'Recebe uma lista de IDs de pedidos e retorna as rotas otimizadas usando Google Maps Route Optimization API'
  })
  @ApiBody({ type: OptimizeRoutesDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Rotas otimizadas com sucesso',
    type: OptimizationResultDto
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos ou pedidos não encontrados'
  })
  @ApiResponse({ 
    status: 500, 
    description: 'Erro interno do servidor ou falha na API do Google'
  })
  async optimizeRoutes(@Body() optimizeRoutesDto: OptimizeRoutesDto): Promise<OptimizationResultDto> {
    try {
      this.logger.log(`Iniciando otimização para ${optimizeRoutesDto.orderIds.length} pedidos: ${optimizeRoutesDto.orderIds.join(', ')}`);
      
      const startTime = Date.now();
      const result = await this.optimizationRoutesService.optimizeRoutes(optimizeRoutesDto.orderIds);
      const endTime = Date.now();
      
      result.optimizationTime = endTime - startTime;
      
      this.logger.log(`Otimização concluída em ${result.optimizationTime}ms. ${result.totalRoutes} rotas criadas para ${result.totalOrders} pedidos`);
      
      return result;
    } catch (error) {
      this.logger.error('Erro na otimização de rotas:', error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: 'Erro interno durante a otimização de rotas',
          error: error instanceof Error ? error.message : 'Erro desconhecido'
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('validate-orders')
  @ApiOperation({ 
    summary: 'Validar pedidos antes da otimização',
    description: 'Verifica se os pedidos existem e estão válidos para otimização'
  })
  @ApiBody({ type: OptimizeRoutesDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Validação concluída'
  })
  async validateOrders(@Body() optimizeRoutesDto: OptimizeRoutesDto) {
    try {
      this.logger.log(`Validando ${optimizeRoutesDto.orderIds.length} pedidos`);
      
      const validation = await this.optimizationRoutesService.validateOrders(optimizeRoutesDto.orderIds);
      
      this.logger.log(`Validação concluída: ${validation.validOrders.length} válidos, ${validation.invalidOrders.length} inválidos`);
      
      return {
        success: true,
        message: 'Validação concluída',
        totalOrders: optimizeRoutesDto.orderIds.length,
        validOrders: validation.validOrders,
        invalidOrders: validation.invalidOrders,
        // O motivo de cada exclusão é o que a tela mostra para a pessoa
        // entender por que o pedido não entra na rota. Antes era descartado.
        unassigned: validation.unassigned,
        // Sem nenhum pedido elegível não há o que otimizar. Antes isso olhava
        // só os pedidos inexistentes, então dizia "pode otimizar" para uma
        // seleção inteira de pedidos inelegíveis.
        canOptimize: validation.validOrders.length > 0
      };
    } catch (error) {
      this.logger.error('Erro na validação de pedidos:', error);
      throw new HttpException(
        'Erro durante a validação dos pedidos',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
