import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../../../shared/entities/company.entity';
import { UpdateCompanyDto } from '../dto/update-company.dto';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';
import { AddressCoordinatesService } from '../../../optimization-routes/services/address-coordinates.service';

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
  /** Fuso da empresa — converte a janela de entrega e o expediente para UTC. */
  timezone: string;
  /** Expediente padrão, usado quando o pedido não tem janela própria. */
  operationStartTime: string;
  operationEndTime: string;
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
    private addressCoordinates: AddressCoordinatesService,
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

    // Campo ausente no payload não é "apagar": é "não mexer". Sem isso, salvar
    // a aba de identificação zeraria o depósito.
    const alteracoes = Object.fromEntries(
      Object.entries(updateCompanyDto).filter(([, valor]) => valor !== undefined),
    );

    Object.assign(company, {
      ...alteracoes,
      updated_by: user?.email ?? undefined,
    });

    await this.resolveDepotCoordinates(
      company,
      alteracoes.depot_latitude !== undefined && alteracoes.depot_longitude !== undefined,
    );

    const saved = await this.companyRepository.save(company);
    this.logger.log(`Empresa ${saved.id_company} atualizada por ${user?.email ?? 'desconhecido'}`);

    return saved;
  }

  /**
   * Resolve as coordenadas do depósito a partir do endereço.
   *
   * O endereço é a fonte da verdade: digitar latitude e longitude à mão é
   * pedir para alguém errar, e o erro é silencioso — as rotas simplesmente
   * partem do lugar errado.
   *
   * `informadoManualmente` é a saída de emergência: coordenadas enviadas
   * explicitamente são respeitadas e passam a valer para o endereço atual,
   * para que o salvamento seguinte não as sobrescreva.
   */
  private async resolveDepotCoordinates(
    company: Company,
    informadoManualmente: boolean,
  ): Promise<void> {
    const parts = {
      street: company.depot_street,
      number: company.depot_number,
      district: company.depot_district,
      city: company.depot_city,
      state: company.depot_state,
      zipCode: company.depot_zip_code,
    };

    const chave = this.addressCoordinates.keyFor(parts);

    if (informadoManualmente) {
      company.depot_geocoded_address = chave ?? null;
      return;
    }

    // Endereço inalterado desde a última resolução: nada a fazer.
    if (
      this.addressCoordinates.storedIsFresh(
        company.depot_geocoded_address,
        company.depot_latitude,
        company.depot_longitude,
        chave,
      )
    ) {
      return;
    }

    const resolvido = await this.addressCoordinates.resolve(parts, company.depot_city);

    // Coordenada simulada não entra no cadastro: seria indistinguível de uma
    // real e faria as rotas partirem de um ponto inventado.
    if (!resolvido || resolvido.source === 'simulated') {
      this.logger.warn(
        `Não foi possível resolver as coordenadas do depósito da empresa ${company.id_company}.`,
      );
      company.depot_latitude = null;
      company.depot_longitude = null;
      company.depot_geocoded_address = null;
      return;
    }

    company.depot_latitude = resolvido.latitude;
    company.depot_longitude = resolvido.longitude;
    company.depot_geocoded_address = resolvido.addressKey;
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
      timezone: company?.timezone || 'America/Sao_Paulo',
      operationStartTime: company?.operation_start_time || '08:00',
      operationEndTime: company?.operation_end_time || '18:00',
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
