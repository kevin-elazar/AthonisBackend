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
import { DriverEventDto } from '../dto/driver-event.dto';

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
}
