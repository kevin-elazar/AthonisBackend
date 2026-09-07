import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { CompanyService } from '@/modules/company/services/company.service';
import { Company } from '@/shared/entities/company.entity';
import { TenantContextService } from '@/shared/tenant/tenant-context.service';

describe('CompanyService', () => {
  let service: CompanyService;
  let companyRepository: Repository<Company>;

  const mockCompany = {
    id_company: 1000,
    corporate_name: 'Athonis Logística Ltda',
    trade_name: 'Athonis',
    document: '12345678000199',
    depot_street: 'Rodovia Anhanguera',
    depot_number: '2500',
    depot_district: 'Distrito Industrial',
    depot_city: 'Campinas',
    depot_state: 'SP',
    depot_latitude: -22.9056,
    depot_longitude: -47.0608,
    cost_per_km: 2.5,
    cost_per_hour: 80,
    stop_duration_minutes: 20,
    default_vehicle_capacity_kg: 2000,
    timezone: 'America/Sao_Paulo',
    is_active: true,
  } as Company;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyService,
        {
          provide: getRepositoryToken(Company),
          useValue: {
            findOne: jest.fn().mockResolvedValue(mockCompany),
            save: jest
              .fn()
              .mockImplementation((company) => Promise.resolve(company)),
          },
        },
        {
          provide: TenantContextService,
          useValue: {
            getIdCompany: jest.fn().mockReturnValue(1000),
            getUser: jest.fn().mockReturnValue({ email: 'admin@athonis.com' }),
          },
        },
      ],
    }).compile();

    service = module.get<CompanyService>(CompanyService);
    companyRepository = module.get<Repository<Company>>(getRepositoryToken(Company));
  });

  afterEach(() => jest.clearAllMocks());

  describe('findCurrent', () => {
    it('busca a empresa do tenant do usuário autenticado', async () => {
      const result = await service.findCurrent();

      expect(companyRepository.findOne).toHaveBeenCalledWith({
        where: { id_company: 1000 },
      });
      expect(result).toHaveProperty('trade_name', 'Athonis');
    });

    it('orienta o cadastro no banco quando a empresa não existe', async () => {
      jest.spyOn(companyRepository, 'findOne').mockResolvedValue(null);

      await expect(service.findCurrent()).rejects.toThrow(NotFoundException);
      await expect(service.findCurrent()).rejects.toThrow(/create-company/);
    });
  });

  describe('updateCurrent', () => {
    it('registra quem alterou e mantém o tenant', async () => {
      const result = await service.updateCurrent({ trade_name: 'Athonis Log' });

      expect(result).toHaveProperty('trade_name', 'Athonis Log');
      expect(result).toHaveProperty('updated_by', 'admin@athonis.com');
      expect(result).toHaveProperty('id_company', 1000);
    });
  });

  describe('getRoutingSettings', () => {
    it('usa o depósito e os custos cadastrados pela empresa', async () => {
      const settings = await service.getRoutingSettings();

      expect(settings.depot).toEqual({ latitude: -22.9056, longitude: -47.0608 });
      expect(settings.costPerKm).toBe(2.5);
      expect(settings.costPerHour).toBe(80);
      expect(settings.stopDurationMinutes).toBe(20);
      expect(settings.defaultVehicleCapacityKg).toBe(2000);
      expect(settings.usingFallbackDepot).toBe(false);
      expect(settings.depotAddress).toBe(
        'Rodovia Anhanguera, 2500, Distrito Industrial, Campinas, SP',
      );
    });

    it('sinaliza quando cai no depósito padrão por falta de coordenadas', async () => {
      jest.spyOn(companyRepository, 'findOne').mockResolvedValue({
        ...mockCompany,
        depot_latitude: null,
        depot_longitude: null,
      } as unknown as Company);

      const settings = await service.getRoutingSettings();

      // O ponto padrão não pode passar por endereço real da empresa.
      expect(settings.usingFallbackDepot).toBe(true);
      expect(settings.depot).toEqual({ latitude: -23.5505, longitude: -46.6333 });
    });

    it('não quebra a otimização quando a empresa ainda não foi cadastrada', async () => {
      jest.spyOn(companyRepository, 'findOne').mockResolvedValue(null);

      const settings = await service.getRoutingSettings();

      expect(settings.usingFallbackDepot).toBe(true);
      expect(settings.costPerKm).toBe(1.0);
      expect(settings.depotAddress).toBeNull();
    });
  });
});
