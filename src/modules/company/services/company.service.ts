import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../../../shared/entities/company.entity';
import { UpdateCompanyDto } from '../dto/update-company.dto';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';

/** Parâmetros de roteirização resolvidos para a empresa atual. */
export type RoutingSettings = {
  depot: { latitude: number; longitude: number };
  depotAddress: string | null;
  costPerKm: number;
  costPerHour: number;
  stopDurationMinutes: number;
  defaultVehicleCapacityKg: number;
  /** true quando a empresa não tem depósito cadastrado e caímos no padrão. */
  usingFallbackDepot: boolean;
};

/**
 * Depósito usado apenas enquanto a empresa não cadastra o próprio endereço.
 * Praça da Sé, São Paulo — o valor que antes estava fixo no código.
 */
const FALLBACK_DEPOT = { latitude: -23.5505, longitude: -46.6333 };

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    private tenantContext: TenantContextService,
  ) {}

  /** Empresa do usuário autenticado. */
  async findCurrent(): Promise<Company> {
    const idCompany = this.tenantContext.getIdCompany();
    const company = await this.companyRepository.findOne({ where: { id_company: idCompany } });

    if (!company) {
      throw new NotFoundException(
        `Empresa ${idCompany} não cadastrada. Cadastre-a no banco de dados ` +
          `(veja scripts/create-company.js) antes de usar o sistema.`,
      );
    }

    return company;
  }

  /** Atualiza os dados da própria empresa. Não cria e não troca de tenant. */
  async updateCurrent(updateCompanyDto: UpdateCompanyDto): Promise<Company> {
    const company = await this.findCurrent();
    const user = this.tenantContext.getUser();

    Object.assign(company, {
      ...updateCompanyDto,
      updated_by: user?.email ?? undefined,
    });

    const saved = await this.companyRepository.save(company);
    this.logger.log(`Empresa ${saved.id_company} atualizada por ${user?.email ?? 'desconhecido'}`);

    return saved;
  }

  /**
   * Parâmetros que a otimização de rotas consome. Quando a empresa ainda não
   * tem depósito cadastrado, devolve o padrão e sinaliza — assim quem chama
   * pode avisar em vez de silenciosamente rotear a partir de São Paulo.
   */
  async getRoutingSettings(): Promise<RoutingSettings> {
    const idCompany = this.tenantContext.getIdCompany();
    const company = await this.companyRepository.findOne({ where: { id_company: idCompany } });

    const hasDepot =
      company?.depot_latitude !== null &&
      company?.depot_latitude !== undefined &&
      company?.depot_longitude !== null &&
      company?.depot_longitude !== undefined;

    if (!company) {
      this.logger.warn(
        `Empresa ${idCompany} sem cadastro: usando depósito e custos padrão na otimização.`,
      );
    } else if (!hasDepot) {
      this.logger.warn(
        `Empresa ${idCompany} sem coordenadas de depósito: usando o depósito padrão.`,
      );
    }

    return {
      depot: hasDepot
        ? {
            latitude: Number(company.depot_latitude),
            longitude: Number(company.depot_longitude),
          }
        : FALLBACK_DEPOT,
      depotAddress: company ? this.formatDepotAddress(company) : null,
      costPerKm: Number(company?.cost_per_km ?? 1.0),
      costPerHour: Number(company?.cost_per_hour ?? 50.0),
      stopDurationMinutes: Number(company?.stop_duration_minutes ?? 30),
      defaultVehicleCapacityKg: Number(company?.default_vehicle_capacity_kg ?? 1000),
      usingFallbackDepot: !hasDepot,
    };
  }

  private formatDepotAddress(company: Company): string | null {
    const address = [
      company.depot_street,
      company.depot_number,
      company.depot_district,
      company.depot_city,
      company.depot_state,
    ]
      .filter(Boolean)
      .join(', ');

    return address || null;
  }
}
