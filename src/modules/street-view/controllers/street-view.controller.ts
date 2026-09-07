import { 
  Controller, 
  Get, 
  Post,
  Delete,
  Param, 
  Body,
  ParseIntPipe,
  HttpStatus,
  HttpCode,
  Header,
  Res
} from '@nestjs/common';
import type { Response as ExpressResponse } from 'express';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBody, 
  ApiParam,
  ApiBearerAuth 
} from '@nestjs/swagger';
import { StreetViewService } from '../services/street-view.service';
import { StreetViewResponseDto, StreetViewBatchRequestDto } from '../dto/street-view-response.dto';

@ApiTags('Street View')
@Controller('street-view')
@ApiBearerAuth('JWT-auth')
export class StreetViewController {
  constructor(private readonly streetViewService: StreetViewService) {}

  /**
   * Buscar dados do Street View para um pedido específico
   * Se já existir cache, retorna do banco
   * Se não existir, busca na API do Google e salva no cache
   */
  @Get('order/:orderId')
  @ApiOperation({ 
    summary: 'Buscar dados do Street View para um pedido',
    description: 'Retorna os metadados e URL da imagem do Google Street View para o endereço de entrega do pedido. Se os dados já existirem em cache, retorna do banco de dados. Caso contrário, consulta a API do Google, armazena no cache e retorna.'
  })
  @ApiParam({ 
    name: 'orderId', 
    description: 'ID do pedido', 
    example: 1,
    type: Number 
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Dados do Street View retornados com sucesso',
    type: StreetViewResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Pedido não encontrado'
  })
  @ApiResponse({ 
    status: 502, 
    description: 'Erro ao consultar API do Google Street View'
  })
  @ApiResponse({ 
    status: 503, 
    description: 'API Key do Google Street View não configurada'
  })
  async getStreetViewByOrderId(
    @Param('orderId', ParseIntPipe) orderId: number
  ): Promise<StreetViewResponseDto> {
    return await this.streetViewService.getStreetViewData(orderId);
  }

  /**
   * Buscar dados do Street View para múltiplos pedidos
   */
  @Post('orders/batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Buscar dados do Street View para múltiplos pedidos',
    description: 'Recebe uma lista de IDs de pedidos e retorna os dados do Street View para cada um. Útil para pré-carregar imagens de várias entregas de uma vez.'
  })
  @ApiBody({ type: StreetViewBatchRequestDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Dados do Street View retornados para todos os pedidos',
    type: [StreetViewResponseDto]
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Lista de IDs inválida'
  })
  async getStreetViewBatch(
    @Body() body: StreetViewBatchRequestDto
  ): Promise<StreetViewResponseDto[]> {
    return await this.streetViewService.getStreetViewDataBatch(body.orderIds);
  }

  /**
   * Serve a imagem do Street View pelo próprio backend.
   * A chave da API do Google fica no servidor: o cliente recebe apenas bytes.
   */
  @Get('order/:orderId/image')
  @Header('Cache-Control', 'private, max-age=86400')
  @ApiOperation({
    summary: 'Imagem do Street View do pedido',
    description:
      'Retorna a imagem do Street View do endereço de entrega. O backend consulta o Google server-side, de modo que a chave da API nunca é exposta ao navegador.',
  })
  @ApiParam({ name: 'orderId', description: 'ID do pedido', example: 1, type: Number })
  @ApiResponse({ status: 200, description: 'Imagem JPEG do panorama' })
  @ApiResponse({ status: 404, description: 'Pedido sem cobertura de Street View' })
  @ApiResponse({ status: 502, description: 'Erro ao consultar a API do Google' })
  async getStreetViewImage(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    const { data, contentType } = await this.streetViewService.getStreetViewImage(orderId);
    res.setHeader('Content-Type', contentType);
    res.send(data);
  }

  /**
   * Invalidar cache do Street View para um pedido
   * Força nova busca na próxima requisição
   */
  @Delete('order/:orderId/cache')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ 
    summary: 'Invalidar cache do Street View',
    description: 'Remove os dados em cache do Street View para um pedido específico. A próxima consulta buscará novos dados da API do Google. Útil quando o endereço do pedido foi alterado.'
  })
  @ApiParam({ 
    name: 'orderId', 
    description: 'ID do pedido', 
    example: 1,
    type: Number 
  })
  @ApiResponse({ 
    status: 204, 
    description: 'Cache invalidado com sucesso'
  })
  async invalidateCache(
    @Param('orderId', ParseIntPipe) orderId: number
  ): Promise<void> {
    await this.streetViewService.invalidateCache(orderId);
  }
}
