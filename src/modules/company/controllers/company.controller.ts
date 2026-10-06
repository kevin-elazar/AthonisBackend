import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CompanyService } from '../services/company.service';
import { UpdateCompanyDto } from '../dto/update-company.dto';
import { Company } from '../../../shared/entities/company.entity';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

/**
 * Só leitura e edição da própria empresa.
 *
 * Não existe POST nem DELETE aqui de propósito: criar ou remover um tenant é
 * operação de banco de dados, feita por quem administra o sistema
 * (`scripts/create-company.js`). Expor isso na API permitiria que um admin de
 * uma empresa criasse tenants à revelia.
 */
@ApiTags('Empresa')
@Controller('company')
@ApiBearerAuth('JWT-auth')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get()
  @ApiOperation({
    summary: 'Dados da empresa do usuário autenticado',
    description:
      'Retorna o cadastro da empresa: identificação, contato, endereço do depósito e parâmetros de roteirização.',
  })
  @ApiResponse({ status: 200, description: 'Dados da empresa', type: Company })
  @ApiResponse({ status: 404, description: 'Empresa não cadastrada no banco' })
  async findCurrent(): Promise<Company> {
    return this.companyService.findCurrent();
  }

  @Patch()
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({
    summary: 'Atualizar dados da empresa (apenas Admin)',
    description:
      'Altera o cadastro da própria empresa. O identificador do tenant não pode ser alterado por aqui.',
  })
  @ApiResponse({ status: 200, description: 'Empresa atualizada', type: Company })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 403, description: 'Apenas administradores podem alterar a empresa' })
  @ApiResponse({ status: 404, description: 'Empresa não cadastrada no banco' })
  async updateCurrent(@Body() updateCompanyDto: UpdateCompanyDto): Promise<Company> {
    return this.companyService.updateCurrent(updateCompanyDto);
  }
}
