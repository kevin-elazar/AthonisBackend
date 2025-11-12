import { Controller, Get, Post, Body, Patch, Param, Delete, Query, Logger, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from '../services/orders.service';
import { CreateOrderDto } from '../dto/create-order.dto';
import { UpdateOrderDto } from '../dto/update-order.dto';
import { FindOrderDto } from '../dto/find-order.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('Pedidos')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ 
    summary: 'Criar um novo pedido',
    description: 'Registra um novo pedido no sistema de logística.' 
  })
  @ApiBody({ type: CreateOrderDto })
  @ApiResponse({ 
    status: 201, 
    description: 'Pedido criado com sucesso',
    schema: {
      example: {
        order_id: 1,
        client_id: 1,
        title: 'Entrega de mercadorias',
        urgency: 'normal'
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  async create(@Body() createOrderDto: CreateOrderDto) {
    try {
      this.logger.log(`Creating order: ${JSON.stringify(createOrderDto)}`);
      const result = await this.ordersService.create(createOrderDto);
      this.logger.log(`Order created successfully: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to create order: ${message}`, stack);
      throw error;
    }
  }

  @Get()
  @ApiOperation({ 
    summary: 'Listar todos os pedidos',
    description: 'Retorna uma lista de pedidos com opção de filtros de busca.' 
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de pedidos retornada com sucesso',
    schema: {
      example: {
        success: true,
        data: [
          {
            order_id: 1,
            title: 'Entrega de mercadorias',
            urgency: 'normal',
            client: {
              name: 'João Silva'
            }
          }
        ]
      }
    }
  })
  findAll(@Query() query: FindOrderDto) {
    return this.ordersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Buscar pedido por ID',
    description: 'Retorna os detalhes de um pedido específico pelo seu ID.' 
  })
  @ApiParam({ name: 'id', description: 'ID do pedido', type: 'number' })
  @ApiResponse({ 
    status: 200, 
    description: 'Pedido encontrado com sucesso',
    schema: {
      example: {
        order_id: 1,
        title: 'Entrega de mercadorias',
        urgency: 'normal',
        delivery_city: 'São Paulo'
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Pedido não encontrado' })
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ 
    summary: 'Atualizar um pedido',
    description: 'Atualiza os dados de um pedido existente.' 
  })
  @ApiParam({ name: 'id', description: 'ID do pedido', type: 'number' })
  @ApiBody({ type: CreateOrderDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Pedido atualizado com sucesso',
    schema: {
      example: {
        success: true,
        message: 'Pedido atualizado com sucesso'
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Pedido não encontrado' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  update(@Param('id') id: string, @Body() updateOrderDto: UpdateOrderDto) {
    return this.ordersService.update(id, updateOrderDto);
  }

  @Delete(':id')
  @ApiOperation({ 
    summary: 'Deletar um pedido',
    description: 'Remove um pedido do sistema.' 
  })
  @ApiParam({ name: 'id', description: 'ID do pedido', type: 'number' })
  @ApiResponse({ 
    status: 200, 
    description: 'Pedido deletado com sucesso',
    schema: {
      example: {
        success: true,
        message: 'Pedido deletado com sucesso'
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Pedido não encontrado' })
  remove(@Param('id') id: string) {
    return this.ordersService.remove(id);
  }
}
