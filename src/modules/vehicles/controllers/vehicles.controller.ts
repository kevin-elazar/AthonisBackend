import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { VehiclesService } from '../services/vehicles.service';
import { CreateVehicleDto } from '../dto/create-vehicle.dto';
import { UpdateVehicleDto } from '../dto/update-vehicle.dto';
import { FindVehicleDto } from '../dto/find-vehicle.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('Veículos')
@Controller('vehicles')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @ApiOperation({ 
    summary: 'Criar um novo veículo',
    description: 'Registra um novo veículo no sistema.' 
  })
  @ApiBody({ type: CreateVehicleDto })
  @ApiResponse({ 
    status: 201, 
    description: 'Veículo criado com sucesso',
    schema: {
      example: {
        vehicle_id: 1,
        name: 'Van de Entregas 001',
        brand: 'Ford',
        model: 'Transit'
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  create(@Body() createVehicleDto: CreateVehicleDto) {
    return this.vehiclesService.create(createVehicleDto);
  }

  @Get()
  @ApiOperation({ 
    summary: 'Listar todos os veículos',
    description: 'Retorna uma lista de veículos com opção de filtros de busca.' 
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de veículos retornada com sucesso',
    schema: {
      example: {
        success: true,
        data: [
          {
            vehicle_id: 1,
            name: 'Van de Entregas 001',
            brand: 'Ford',
            model: 'Transit'
          }
        ]
      }
    }
  })
  findAll(@Query() query: FindVehicleDto) {
    return this.vehiclesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Buscar veículo por ID',
    description: 'Retorna os detalhes de um veículo específico pelo seu ID.' 
  })
  @ApiParam({ name: 'id', description: 'ID do veículo', type: 'number' })
  @ApiResponse({ 
    status: 200, 
    description: 'Veículo encontrado com sucesso',
    schema: {
      example: {
        vehicle_id: 1,
        name: 'Van de Entregas 001',
        brand: 'Ford',
        model: 'Transit',
        year: 2020
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Veículo não encontrado' })
  findOne(@Param('id') id: string) {
    return this.vehiclesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ 
    summary: 'Atualizar um veículo',
    description: 'Atualiza os dados de um veículo existente.' 
  })
  @ApiParam({ name: 'id', description: 'ID do veículo', type: 'number' })
  @ApiBody({ type: CreateVehicleDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Veículo atualizado com sucesso',
    schema: {
      example: {
        success: true,
        message: 'Veículo atualizado com sucesso'
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Veículo não encontrado' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  update(@Param('id') id: string, @Body() updateVehicleDto: UpdateVehicleDto) {
    return this.vehiclesService.update(id, updateVehicleDto);
  }

  @Delete(':id')
  @ApiOperation({ 
    summary: 'Deletar um veículo',
    description: 'Remove um veículo do sistema.' 
  })
  @ApiParam({ name: 'id', description: 'ID do veículo', type: 'number' })
  @ApiResponse({ 
    status: 200, 
    description: 'Veículo deletado com sucesso',
    schema: {
      example: {
        success: true,
        message: 'Veículo deletado com sucesso'
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Veículo não encontrado' })
  remove(@Param('id') id: string) {
    return this.vehiclesService.remove(id);
  }
}
