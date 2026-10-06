import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrdersService } from '@/modules/orders/services/orders.service';
import { Order } from '@/shared/entities/order.entity';
import { Client } from '@/shared/entities/client.entity';
import { Vehicle } from '@/shared/entities/vehicle.entity';
import { Driver } from '@/shared/entities/driver.entity';
import { TenantContextService } from '@/shared/tenant/tenant-context.service';
import { createOrderDto, createOrderDtoWithOptional } from '../fixtures/order.fixtures';

describe('OrdersService', () => {
  let service: OrdersService;
  let orderRepository: Repository<Order>;
  let clientRepository: Repository<Client>;
  let vehicleRepository: Repository<Vehicle>;
  let driverRepository: Repository<Driver>;
  let tenantContext: TenantContextService;

  const mockOrder = {
    order_id: 1,
    id_company: 1000,
    client_id: 1,
    title: 'Entrega de mercadorias',
    urgency: 'normal' as const,
    quantity: 10,
    delivery_street: 'Rua das Flores',
    delivery_district: 'Centro',
    delivery_city: 'São Paulo',
    delivery_state: 'SP',
    delivery_zipcode: '01234-567',
    delivery_number: '123',
    vehicle_id: 1,
    driver_id: 1,
    created_by: 'admin@athonis.com',
    updated_by: undefined,
  };

  const mockClient = { client_id: 1, id_company: 1000, name: 'Cliente Teste' };
  const mockVehicle = { vehicle_id: 1, id_company: 1000, name: 'Van 001' };
  const mockDriver = { driver_id: 1, id_company: 1000, name: 'Motorista Teste' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: getRepositoryToken(Order),
          useValue: {
            create: jest.fn().mockImplementation((dto) => ({ ...dto, order_id: 1 })),
            save: jest.fn().mockImplementation((order) => Promise.resolve({ ...order, order_id: 1 })),
            findOne: jest.fn(),
            findAndCount: jest.fn().mockResolvedValue([[mockOrder], 1]),
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Client),
          useValue: {
            findOne: jest.fn().mockResolvedValue(mockClient),
          },
        },
        {
          provide: getRepositoryToken(Vehicle),
          useValue: {
            findOne: jest.fn().mockResolvedValue(mockVehicle),
          },
        },
        {
          provide: getRepositoryToken(Driver),
          useValue: {
            findOne: jest.fn().mockResolvedValue(mockDriver),
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

    service = module.get<OrdersService>(OrdersService);
    orderRepository = module.get<Repository<Order>>(getRepositoryToken(Order));
    clientRepository = module.get<Repository<Client>>(getRepositoryToken(Client));
    vehicleRepository = module.get<Repository<Vehicle>>(getRepositoryToken(Vehicle));
    driverRepository = module.get<Repository<Driver>>(getRepositoryToken(Driver));
    tenantContext = module.get<TenantContextService>(TenantContextService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('deve criar pedido com created_by quando referências são válidas', async () => {
      jest.spyOn(orderRepository, 'findOne').mockResolvedValue({ ...mockOrder, client: mockClient } as Order);

      const result = await service.create(createOrderDto);

      expect(result).toHaveProperty('created_by', 'admin@athonis.com');
      expect(orderRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...createOrderDto,
          id_company: 1000,
          created_by: 'admin@athonis.com',
        }),
      );
    });

    it('deve lançar BadRequestException quando client_id inválido', async () => {
      jest.spyOn(clientRepository, 'findOne').mockResolvedValue(null);

      await expect(service.create(createOrderDto)).rejects.toThrow(BadRequestException);
    });

    it('deve lançar BadRequestException quando vehicle_id inválido', async () => {
      jest.spyOn(vehicleRepository, 'findOne').mockResolvedValue(null);

      await expect(service.create(createOrderDtoWithOptional)).rejects.toThrow(BadRequestException);
    });

    it('deve lançar BadRequestException quando driver_id inválido', async () => {
      jest.spyOn(driverRepository, 'findOne').mockResolvedValue(null);

      await expect(service.create(createOrderDtoWithOptional)).rejects.toThrow(BadRequestException);
    });

    it('deve normalizar vehicle_id e driver_id 0 para undefined', async () => {
      jest.spyOn(orderRepository, 'findOne').mockResolvedValue({ ...mockOrder } as Order);

      await service.create({ ...createOrderDto, vehicle_id: 0, driver_id: 0 });

      expect(orderRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          vehicle_id: undefined,
          driver_id: undefined,
        }),
      );
    });
  });

  describe('findAll', () => {
    it('deve retornar lista paginada com relations', async () => {
      const result = await service.findAll({});

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('meta');
      expect(result.meta).toHaveProperty('total');
      expect(result.meta).toHaveProperty('page');
      expect(result.meta).toHaveProperty('limit');
      expect(orderRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: ['client', 'driver', 'vehicle'],
        }),
      );
    });

    it('deve lançar BadRequestException para sort_by inválido', async () => {
      await expect(service.findAll({ sort_by: 'invalid_field' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('deve retornar pedido com relations quando existe', async () => {
      jest.spyOn(orderRepository, 'findOne').mockResolvedValue({ ...mockOrder, client: mockClient } as Order);

      const result = await service.findOne('1');

      expect(result).toHaveProperty('order_id', 1);
      expect(orderRepository.findOne).toHaveBeenCalledWith({
        where: { order_id: 1, id_company: 1000 },
        relations: ['client', 'driver', 'vehicle'],
      });
    });

    it('deve lançar NotFoundException quando não existe', async () => {
      jest.spyOn(orderRepository, 'findOne').mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('deve atualizar com updated_by', async () => {
      jest.spyOn(orderRepository, 'findOne')
        .mockResolvedValueOnce({ ...mockOrder, client: mockClient } as Order)
        .mockResolvedValueOnce({ ...mockOrder, title: 'Título Atualizado' } as Order);

      const result = await service.update('1', { title: 'Título Atualizado' });

      expect(result).toHaveProperty('title', 'Título Atualizado');
      expect(orderRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          updated_by: 'admin@athonis.com',
        }),
      );
    });

    it('deve validar referências ao atualizar client_id', async () => {
      jest.spyOn(orderRepository, 'findOne')
        .mockResolvedValueOnce({ ...mockOrder, client: mockClient } as Order)
        .mockResolvedValueOnce({ ...mockOrder } as Order);
      jest.spyOn(clientRepository, 'findOne').mockResolvedValue(null);

      await expect(service.update('1', { client_id: 999 })).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('deve remover pedido', async () => {
      jest.spyOn(orderRepository, 'findOne').mockResolvedValue(mockOrder as Order);

      await service.remove('1');

      expect(orderRepository.remove).toHaveBeenCalledWith(mockOrder);
    });
  });
});
