import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { DriverAccessService } from '../services/driver-access.service';
import { GrantDriverAccessDto } from '../dto/grant-driver-access.dto';

@ApiTags('Motoristas')
@Controller('drivers/:driverId/access')
@ApiBearerAuth('JWT-auth')
@UseGuards(RolesGuard)
@Roles('admin')
export class DriverAccessController {
  constructor(private readonly driverAccessService: DriverAccessService) {}

  @Get()
  @ApiOperation({ summary: 'Situação do acesso do motorista ao aplicativo' })
  @ApiResponse({ status: 404, description: 'Motorista não encontrado' })
  get(@Param('driverId', ParseIntPipe) driverId: number) {
    return this.driverAccessService.get(driverId);
  }

  @Put()
  @ApiOperation({
    summary: 'Cria ou redefine o acesso do motorista ao aplicativo',
    description:
      'Se o motorista já tem login, troca e-mail e senha, reativa o acesso e encerra as sessões abertas.',
  })
  @ApiResponse({ status: 409, description: 'Email já cadastrado' })
  grant(
    @Param('driverId', ParseIntPipe) driverId: number,
    @Body() dto: GrantDriverAccessDto,
  ) {
    return this.driverAccessService.grant(driverId, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Desliga o acesso do motorista ao aplicativo',
    description: 'O cadastro e o histórico de entregas do motorista são mantidos.',
  })
  async revoke(@Param('driverId', ParseIntPipe) driverId: number) {
    await this.driverAccessService.revoke(driverId);
  }
}
