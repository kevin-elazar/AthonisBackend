import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { DriversService } from '../services/drivers.service';
import { CreateDriverDto } from '../dto/create-driver.dto';
import { UpdateDriverDto } from '../dto/update-driver.dto';
import { FindDriverDto } from '../dto/find-driver.dto';
@ApiTags('Motoristas')
@Controller('drivers')
@ApiBearerAuth('JWT-auth')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post()
  @ApiOperation({ 
    summary: 'Criar um novo motorista',
    description: 'Registra um novo motorista no sistema.' 
  })
  @ApiBody({ type: CreateDriverDto })
  @ApiResponse({ 
    status: 201, 
    description: 'Motorista criado com sucesso',
    schema: {
      example: {
        driver_id: 1,
        name: 'Pedro Silva',
        document: '123.456.789-00'
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  create(@Body() createDriverDto: CreateDriverDto) {
    console.log("post --------------------------");
    return this.driversService.create(createDriverDto);
  }

  @Get()
  @ApiOperation({ 
    summary: 'Listar todos os motoristas',
    description: 'Retorna uma lista de motoristas com opção de filtros de busca.' 
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de motoristas retornada com sucesso',
    schema: {
      example: {
        success: true,
        data: [
          {
            driver_id: 1,
            name: 'Pedro Silva',
            document: '123.456.789-00'
          }
        ]
      }
    }
  })
  findAll(@Query() query: FindDriverDto) {
    return this.driversService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Buscar motorista por ID',
    description: 'Retorna os detalhes de um motorista específico pelo seu ID.' 
  })
  @ApiParam({ name: 'id', description: 'ID do motorista', type: 'number' })
  @ApiResponse({ 
    status: 200, 
    description: 'Motorista encontrado com sucesso',
    schema: {
      example: {
        driver_id: 1,
        name: 'Pedro Silva',
        document: '123.456.789-00',
        birth_date: '1990-01-01'
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Motorista não encontrado' })
  findOne(@Param('id') id: string) {
    return this.driversService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ 
    summary: 'Atualizar um motorista',
    description: 'Atualiza os dados de um motorista existente.' 
  })
  @ApiParam({ name: 'id', description: 'ID do motorista', type: 'number' })
  @ApiBody({ type: CreateDriverDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Motorista atualizado com sucesso',
    schema: {
      example: {
        success: true,
        message: 'Motorista atualizado com sucesso'
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Motorista não encontrado' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  update(@Param('id') id: string, @Body() updateDriverDto: UpdateDriverDto) {
    return this.driversService.update(id, updateDriverDto);
  }

  @Delete(':id')
  @ApiOperation({ 
    summary: 'Deletar um motorista',
    description: 'Remove um motorista do sistema.' 
  })
  @ApiParam({ name: 'id', description: 'ID do motorista', type: 'number' })
  @ApiResponse({ 
    status: 200, 
    description: 'Motorista deletado com sucesso',
    schema: {
      example: {
        success: true,
        message: 'Motorista deletado com sucesso'
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Motorista não encontrado' })
  remove(@Param('id') id: string) {
    return this.driversService.remove(id);
  }
}
