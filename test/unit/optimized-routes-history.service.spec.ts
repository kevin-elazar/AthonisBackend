import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OptimizedRoutesHistoryService } from '@/optimization-routes/services/optimized-routes-history.service';
import { OptimizedRouteHistory } from '@/shared/entities/optimized-route-history.entity';
import { TenantContextService } from '@/shared/tenant/tenant-context.service';
import { createOptimizedRouteHistoryDto } from '../fixtures/optimized-route-history.fixtures';

describe('OptimizedRoutesHistoryService', () => {
  let service: OptimizedRoutesHistoryService;
  let historyRepository: Repository<OptimizedRouteHistory>;
  let tenantContext: TenantContextService;

  const mockHistory = {
    id: 1,
    id_company: 1000,
    order_ids: [1, 2, 3, 4, 5],
    total_routes: 2,
    total_orders: 5,
    optimization_time_ms: 1500,
    google_api_response: '{"routes": []}',
    optimization_result: '{"success": true}',
    status: 'success',
    notes: 'Otimização realizada',
    created_at: new Date(),
    updated_at: new Date(),
    created_by: 'admin@athonis.com',
    updated_by: undefined,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OptimizedRoutesHistoryService,
        {
          provide: getRepositoryToken(OptimizedRouteHistory),
          useValue: {
            create: jest.fn().mockImplementation((dto) => ({ ...dto, id: 1 })),
            save: jest.fn().mockImplementation((history) => Promise.resolve({ ...history, id: 1 })),
            find: jest.fn().mockResolvedValue([mockHistory]),
            findOne: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              getMany: jest.fn().mockResolvedValue([mockHistory]),
            }),
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

    service = module.get<OptimizedRoutesHistoryService>(OptimizedRoutesHistoryService);
    historyRepository = module.get<Repository<OptimizedRouteHistory>>(getRepositoryToken(OptimizedRouteHistory));
    tenantContext = module.get<TenantContextService>(TenantContextService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('deve criar histórico com created_by', async () => {
      const result = await service.create(createOptimizedRouteHistoryDto);

      expect(result).toHaveProperty('created_by', 'admin@athonis.com');
      expect(result).toHaveProperty('order_ids');
      expect(result).toHaveProperty('total_routes', 2);
      expect(result).toHaveProperty('total_orders', 5);
      expect(historyRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...createOptimizedRouteHistoryDto,
          id_company: 1000,
          created_by: 'admin@athonis.com',
          status: 'success',
        }),
      );
    });
  });

  describe('findAll', () => {
    it('deve retornar lista ordenada por created_at DESC', async () => {
      const result = await service.findAll();

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
      expect(historyRepository.find).toHaveBeenCalledWith({
        where: { id_company: 1000 },
        order: { created_at: 'DESC' },
      });
    });
  });

  describe('findOne', () => {
    it('deve retornar quando existe', async () => {
      jest.spyOn(historyRepository, 'findOne').mockResolvedValue(mockHistory as OptimizedRouteHistory);

      const result = await service.findOne(1);

      expect(result).toHaveProperty('id', 1);
      expect(result).toHaveProperty('order_ids');
    });

    it('deve lançar NotFoundException quando não existe', async () => {
      jest.spyOn(historyRepository, 'findOne').mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('deve atualizar com updated_by', async () => {
      jest.spyOn(historyRepository, 'findOne').mockResolvedValue(mockHistory as OptimizedRouteHistory);

      const result = await service.update(1, { notes: 'Nota atualizada' });

      expect(result).toHaveProperty('notes', 'Nota atualizada');
      expect(historyRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          updated_by: 'admin@athonis.com',
        }),
      );
    });
  });

  describe('remove', () => {
    it('deve remover registro', async () => {
      jest.spyOn(historyRepository, 'findOne').mockResolvedValue(mockHistory as OptimizedRouteHistory);

      await service.remove(1);

      expect(historyRepository.remove).toHaveBeenCalledWith(mockHistory);
    });
  });
});
