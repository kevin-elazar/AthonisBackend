import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OptimizationRoutesService } from '@/optimization-routes/services/optimization-routes.service';
import { Order } from '@/shared/entities/order.entity';
import { Client } from '@/shared/entities/client.entity';
import { Driver } from '@/shared/entities/driver.entity';
import { Vehicle } from '@/shared/entities/vehicle.entity';
import { GeocodingService } from '@/optimization-routes/services/geocoding.service';
import { OptimizedRoutesHistoryService } from '@/optimization-routes/services/optimized-routes-history.service';
import { TenantContextService } from '@/shared/tenant/tenant-context.service';

describe('OptimizationRoutesService', () => {
  let service: OptimizationRoutesService;
  let orderRepository: Repository<Order>;
  let geocodingService: GeocodingService;
  let historyService: OptimizedRoutesHistoryService;
  let tenantContext: TenantContextService;

  const mockClient = { client_id: 1, id_company: 1000, name: 'Cliente Teste' };
  const mockVehicle = { vehicle_id: 1, id_company: 1000, name: 'Van 001' };
  const mockDriver = { driver_id: 1, id_company: 1000, name: 'Motorista Teste' };

  const mockOrderValid = {
    order_id: 1,
    id_company: 1000,
    client_id: 1,
    vehicle_id: 1,
    driver_id: 1,
    delivery_street: 'Rua das Flores',
    delivery_city: 'São Paulo',
    delivery_state: 'SP',
    client: mockClient,
    vehicle: mockVehicle,
    driver: mockDriver,
  };

  const mockOrderInvalidNoDelivery = {
    order_id: 2,
    id_company: 1000,
    client_id: 1,
    vehicle_id: 1,
    driver_id: 1,
    delivery_street: null,
    delivery_city: null,
    delivery_state: null,
    client: mockClient,
    vehicle: mockVehicle,
    driver: mockDriver,
  };

  const mockOrderInvalidNoVehicle = {
    order_id: 3,
    id_company: 1000,
    client_id: 1,
    vehicle_id: null,
    driver_id: null,
    delivery_street: 'Rua Teste',
    delivery_city: 'São Paulo',
    delivery_state: 'SP',
    client: mockClient,
    vehicle: null,
    driver: null,
  };

  const mockCoordinates = { latitude: -23.5505, longitude: -46.6333 };

  beforeEach(async () => {
    delete process.env.GOOGLE_PROJECT_ID;

    const mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ ...mockOrderValid }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OptimizationRoutesService,
        {
          provide: getRepositoryToken(Order),
          useValue: {
            find: jest.fn().mockResolvedValue([mockOrderValid]),
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(Client),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Driver),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Vehicle),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: GeocodingService,
          useValue: {
            geocodeMultipleAddresses: jest.fn().mockRejectedValue(new Error('Geocoding falhou')),
            getSimulatedCoordinates: jest.fn().mockReturnValue(mockCoordinates),
          },
        },
        {
          provide: OptimizedRoutesHistoryService,
          useValue: {
            create: jest.fn().mockResolvedValue({}),
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

    service = module.get<OptimizationRoutesService>(OptimizationRoutesService);
    orderRepository = module.get<Repository<Order>>(getRepositoryToken(Order));
    geocodingService = module.get<GeocodingService>(GeocodingService);
    historyService = module.get<OptimizedRoutesHistoryService>(OptimizedRoutesHistoryService);
    tenantContext = module.get<TenantContextService>(TenantContextService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateOrders', () => {
    it('deve retornar validOrders e invalidOrders corretamente', async () => {
      jest.spyOn(orderRepository, 'find').mockResolvedValue([mockOrderValid as Order]);

      const result = await service.validateOrders([1, 999]);

      expect(result).toHaveProperty('validOrders');
      expect(result).toHaveProperty('invalidOrders');
      expect(result.validOrders).toContain(1);
      expect(result.invalidOrders).toContain(999);
    });

    it('deve filtrar pedidos sem dados de entrega (isOrderValidForOptimization)', async () => {
      jest
        .spyOn(orderRepository, 'find')
        .mockResolvedValue([mockOrderValid, mockOrderInvalidNoDelivery] as Order[]);

      const result = await service.validateOrders([1, 2]);

      expect(result.validOrders).toContain(1);
      expect(result.validOrders).not.toContain(2);
    });

    it('deve filtrar pedidos sem vehicle_id e driver_id', async () => {
      jest
        .spyOn(orderRepository, 'find')
        .mockResolvedValue([mockOrderValid, mockOrderInvalidNoVehicle] as Order[]);

      const result = await service.validateOrders([1, 3]);

      expect(result.validOrders).toContain(1);
      expect(result.validOrders).not.toContain(3);
    });
  });

  describe('optimizeRoutes', () => {
    it('deve lançar HttpException quando há invalidOrders', async () => {
      jest.spyOn(orderRepository, 'find').mockResolvedValue([mockOrderValid] as Order[]);

      await expect(service.optimizeRoutes([1, 999])).rejects.toThrow(HttpException);
    });

    it('deve lançar HttpException quando validOrders vazio', async () => {
      jest
        .spyOn(orderRepository, 'find')
        .mockResolvedValue([mockOrderInvalidNoDelivery] as Order[]);

      await expect(service.optimizeRoutes([2])).rejects.toThrow(HttpException);
    });

    it('deve retornar OptimizationResultDto com rotas simuladas quando googleMapsClient não disponível', async () => {
      jest.spyOn(orderRepository, 'find').mockResolvedValue([mockOrderValid] as Order[]);

      const result = await service.optimizeRoutes([1]);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('message', 'Rotas otimizadas com sucesso');
      expect(result).toHaveProperty('totalRoutes');
      expect(result).toHaveProperty('totalOrders', 1);
      expect(result).toHaveProperty('optimizationTime');
      expect(result).toHaveProperty('routes');
      expect(result.routes).toBeInstanceOf(Array);
      expect(result.routes.length).toBeGreaterThan(0);
      expect(result.routes[0]).toHaveProperty('vehicleId', 1);
      expect(result.routes[0]).toHaveProperty('driverId', 1);
      expect(result.routes[0]).toHaveProperty('stops');
      expect(result.routes[0].stops).toHaveLength(1);
      expect(historyService.create).toHaveBeenCalled();
    });
  });
});
