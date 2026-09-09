import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OptimizationRoutesService } from '@/optimization-routes/services/optimization-routes.service';
import { Order } from '@/shared/entities/order.entity';
import { Client } from '@/shared/entities/client.entity';
import { Driver } from '@/shared/entities/driver.entity';
import { Vehicle } from '@/shared/entities/vehicle.entity';
import { GeocodingService } from '@/optimization-routes/services/geocoding.service';
import { AddressCoordinatesService } from '@/optimization-routes/services/address-coordinates.service';
import { OptimizedRoutesHistoryService } from '@/optimization-routes/services/optimized-routes-history.service';
import { TenantContextService } from '@/shared/tenant/tenant-context.service';
import { CompanyService } from '@/modules/company/services/company.service';

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

  const mockManager = {
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((_entity: unknown, dados: unknown) => dados),
    save: jest.fn().mockResolvedValue({ route_id: 10 }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };

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
            // Sem chave configurada: o servico cai para coordenadas simuladas
            // e o resultado precisa se declarar como simulado.
            isConfigured: jest.fn().mockReturnValue(false),
            geocodeMultipleAddresses: jest.fn().mockRejectedValue(new Error('Geocoding falhou')),
            getSimulatedCoordinates: jest.fn().mockReturnValue(mockCoordinates),
          },
        },
        {
          provide: OptimizedRoutesHistoryService,
          useValue: {
            create: jest.fn().mockResolvedValue({ id: 1 }),
          },
        },
        {
          // Sem cache nem chave: cai na coordenada simulada, que e o cenario
          // destes testes.
          provide: AddressCoordinatesService,
          useValue: {
            keyFor: jest.fn(() => 'chave'),
            storedIsFresh: jest.fn().mockReturnValue(false),
            resolve: jest.fn().mockResolvedValue({
              latitude: mockCoordinates.latitude,
              longitude: mockCoordinates.longitude,
              addressKey: 'chave',
              source: 'simulated',
            }),
          },
        },
        {
          // A gravacao das rotas roda em transacao; aqui so precisamos que o
          // callback execute com um manager que aceite as chamadas.
          provide: DataSource,
          useValue: {
            transaction: jest.fn(async (cb: (manager: unknown) => Promise<void>) =>
              cb(mockManager),
            ),
          },
        },
        {
          provide: CompanyService,
          useValue: {
            // Empresa sem depósito cadastrado: a rota parte do ponto padrão
            // e o resultado precisa sinalizar isso.
            getRoutingSettings: jest.fn().mockResolvedValue({
              depot: { latitude: -23.5505, longitude: -46.6333 },
              depotAddress: null,
              costPerKm: 1.0,
              costPerHour: 50.0,
              stopDurationMinutes: 30,
              defaultVehicleCapacityKg: 1000,
              usingFallbackDepot: true,
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

  describe('elegibilidade sem cliente', () => {
    it('considera roteirizável um pedido sem cliente (entrega avulsa)', async () => {
      const avulso = { ...mockOrderValid, order_id: 50, client_id: null, client: null };
      jest.spyOn(orderRepository, 'find').mockResolvedValue([avulso] as unknown as Order[]);

      const validation = await service.validateOrders([50]);

      // A rota é feita a partir do endereço; o cliente não é pré-requisito.
      expect(validation.validOrders).toContain(50);
      expect(validation.unassigned).toEqual([]);
    });
  });

  describe('optimizeRoutes', () => {
    it('reporta pedido inexistente em unassignedOrders em vez de abortar tudo', async () => {
      jest.spyOn(orderRepository, 'find').mockResolvedValue([mockOrderValid] as Order[]);

      const result = await service.optimizeRoutes([1, 999]);

      // O pedido valido continua sendo roteirizado...
      expect(result.routes.length).toBeGreaterThan(0);
      // ...e o que ficou de fora aparece com o motivo, em vez de sumir.
      expect(result.unassignedOrders).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            orderId: 999,
            reason: 'Pedido não encontrado ou pertence a outra empresa',
          }),
        ]),
      );
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
      // Rota sem Google é simulada e precisa se identificar como tal.
      expect(result).toHaveProperty('simulated', true);
      expect(result).toHaveProperty('mode', 'simulated');
      expect(result.message).toContain('SIMULADO');
      expect(result.routes[0]).toHaveProperty('mode', 'simulated');
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
