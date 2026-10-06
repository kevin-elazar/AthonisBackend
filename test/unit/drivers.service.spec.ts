import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DriversService } from '@/modules/drivers/services/drivers.service';
import { Driver } from '@/shared/entities/driver.entity';
import { TenantContextService } from '@/shared/tenant/tenant-context.service';
import { createDriverDto } from '../fixtures/driver.fixtures';


/** Query builder encadeavel para as consultas agregadas (pedidos por cliente/motorista). */
const createAggregateQueryBuilderMock = (rows: any[] = []) => {
  const qb: any = {
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    from: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    groupBy: jest.fn(() => qb),
    getRawMany: jest.fn().mockResolvedValue(rows),
  };
  return qb;
};

describe('DriversService', () => {
  let service: DriversService;
  let driverRepository: Repository<Driver>;
  let tenantContext: TenantContextService;

  const mockDriver = {
    driver_id: 1,
    id_company: 1000,
    name: 'Pedro Silva',
    document: '12345678900',
    gender: 'M',
    birth_date: new Date('1990-01-15'),
    status: 'available' as const,
    created_at: new Date(),
    updated_at: new Date(),
    created_by: 'admin@athonis.com',
    updated_by: undefined,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriversService,
        {
          provide: getRepositoryToken(Driver),
          useValue: {
            create: jest.fn().mockImplementation((dto) => ({ ...dto, driver_id: 1 })),
            save: jest.fn().mockImplementation((driver) => Promise.resolve({ ...driver, driver_id: 1 })),
            findOne: jest.fn(),
            findAndCount: jest.fn().mockResolvedValue([[mockDriver], 1]),
            remove: jest.fn(),
            manager: {
              createQueryBuilder: jest.fn(() => createAggregateQueryBuilderMock()),
            },
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

    service = module.get<DriversService>(DriversService);
    driverRepository = module.get<Repository<Driver>>(getRepositoryToken(Driver));
    tenantContext = module.get<TenantContextService>(TenantContextService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('deve criar motorista com created_by e id_company', async () => {
      const result = await service.create(createDriverDto);

      expect(result).toHaveProperty('created_by', 'admin@athonis.com');
      expect(result).toHaveProperty('id_company', 1000);
      expect(driverRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...createDriverDto,
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
    it('deve retornar motorista quando existe', async () => {
      jest.spyOn(driverRepository, 'findOne').mockResolvedValue(mockDriver as Driver);

      const result = await service.findOne('1');

      expect(result).toEqual(mockDriver);
    });

    it('deve lançar NotFoundException quando não existe', async () => {
      jest.spyOn(driverRepository, 'findOne').mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('deve atualizar com updated_by', async () => {
      jest.spyOn(driverRepository, 'findOne').mockResolvedValue(mockDriver as Driver);

      const result = await service.update('1', { name: 'Pedro Silva Atualizado' });

      expect(result).toHaveProperty('name', 'Pedro Silva Atualizado');
      expect(driverRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          updated_by: 'admin@athonis.com',
        }),
      );
    });
  });

  describe('remove', () => {
    it('deve remover motorista', async () => {
      jest.spyOn(driverRepository, 'findOne').mockResolvedValue(mockDriver as Driver);

      await service.remove('1');

      expect(driverRepository.remove).toHaveBeenCalledWith(mockDriver);
    });
  });
});
