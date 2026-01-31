import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VehiclesService } from '@/modules/vehicles/services/vehicles.service';
import { Vehicle } from '@/shared/entities/vehicle.entity';
import { TenantContextService } from '@/shared/tenant/tenant-context.service';
import { createVehicleDto } from '../fixtures/vehicle.fixtures';

describe('VehiclesService', () => {
  let service: VehiclesService;
  let vehicleRepository: Repository<Vehicle>;
  let tenantContext: TenantContextService;

  const mockVehicle = {
    vehicle_id: 1,
    id_company: 1000,
    name: 'Van de Entregas 001',
    brand: 'Ford',
    model: 'Transit',
    year: 2022,
    created_at: new Date(),
    updated_at: new Date(),
    created_by: 'admin@athonis.com',
    updated_by: undefined,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehiclesService,
        {
          provide: getRepositoryToken(Vehicle),
          useValue: {
            create: jest.fn().mockImplementation((dto) => ({ ...dto, vehicle_id: 1 })),
            save: jest.fn().mockImplementation((vehicle) => Promise.resolve({ ...vehicle, vehicle_id: 1 })),
            findOne: jest.fn(),
            findAndCount: jest.fn().mockResolvedValue([[mockVehicle], 1]),
            remove: jest.fn(),
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

    service = module.get<VehiclesService>(VehiclesService);
    vehicleRepository = module.get<Repository<Vehicle>>(getRepositoryToken(Vehicle));
    tenantContext = module.get<TenantContextService>(TenantContextService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('deve criar veículo com created_by e id_company', async () => {
      const result = await service.create(createVehicleDto);

      expect(result).toHaveProperty('created_by', 'admin@athonis.com');
      expect(result).toHaveProperty('id_company', 1000);
      expect(vehicleRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...createVehicleDto,
          id_company: 1000,
          created_by: 'admin@athonis.com',
        }),
      );
    });
  });

  describe('findAll', () => {
    it('deve retornar lista paginada', async () => {
      const result = await service.findAll({});

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('meta');
      expect(result.meta).toHaveProperty('total');
      expect(result.meta).toHaveProperty('page');
      expect(result.meta).toHaveProperty('limit');
    });

    it('deve lançar BadRequestException para sort_by inválido', async () => {
      await expect(service.findAll({ sort_by: 'invalid_field' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('deve retornar veículo quando existe', async () => {
      jest.spyOn(vehicleRepository, 'findOne').mockResolvedValue(mockVehicle as Vehicle);

      const result = await service.findOne('1');

      expect(result).toEqual(mockVehicle);
    });

    it('deve lançar NotFoundException quando não existe', async () => {
      jest.spyOn(vehicleRepository, 'findOne').mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('deve atualizar com updated_by', async () => {
      jest.spyOn(vehicleRepository, 'findOne').mockResolvedValue(mockVehicle as Vehicle);

      const result = await service.update('1', { name: 'Van Atualizada' });

      expect(result).toHaveProperty('name', 'Van Atualizada');
      expect(vehicleRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          updated_by: 'admin@athonis.com',
        }),
      );
    });
  });

  describe('remove', () => {
    it('deve remover veículo', async () => {
      jest.spyOn(vehicleRepository, 'findOne').mockResolvedValue(mockVehicle as Vehicle);

      await service.remove('1');

      expect(vehicleRepository.remove).toHaveBeenCalledWith(mockVehicle);
    });
  });
});
