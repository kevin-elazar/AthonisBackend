import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { StreetViewService } from '@/modules/street-view/services/street-view.service';
import { StreetViewCache } from '@/shared/entities/street-view-cache.entity';
import { Order } from '@/shared/entities/order.entity';
import { TenantContextService } from '@/shared/tenant/tenant-context.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('StreetViewService', () => {
  let service: StreetViewService;
  let streetViewCacheRepository: Repository<StreetViewCache>;
  let orderRepository: Repository<Order>;
  let tenantContext: TenantContextService;

  const mockOrder = {
    order_id: 1,
    id_company: 1000,
    delivery_street: 'Rua das Flores',
    delivery_number: '123',
    delivery_district: 'Centro',
    delivery_city: 'São Paulo',
    delivery_state: 'SP',
    delivery_zipcode: '01234-567',
  };

  const mockCache = {
    id: 1,
    order_id: 1,
    id_company: 1000,
    address: 'Rua das Flores, 123, Centro, São Paulo, SP, 01234-567',
    status: 'OK',
    pano_id: 'pano123',
    latitude: -23.5505,
    longitude: -46.6333,
    image_url: 'https://maps.googleapis.com/...',
    created_at: new Date(),
    created_by: 'admin@athonis.com',
  };

  const mockStreetViewApiResponse = {
    status: 'OK',
    pano_id: 'pano123',
    location: { lat: -23.5505, lng: -46.6333 },
    date: '2024-01',
  };

  beforeEach(async () => {
    process.env.GOOGLE_GEOCODING_API_KEY = 'test-api-key';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StreetViewService,
        {
          provide: getRepositoryToken(StreetViewCache),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn().mockImplementation((dto) => ({ ...dto })),
            save: jest.fn().mockImplementation((cache) => Promise.resolve({ ...cache, id: 1 })),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Order),
          useValue: {
            findOne: jest.fn(),
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

    service = module.get<StreetViewService>(StreetViewService);
    streetViewCacheRepository = module.get<Repository<StreetViewCache>>(getRepositoryToken(StreetViewCache));
    orderRepository = module.get<Repository<Order>>(getRepositoryToken(Order));
    tenantContext = module.get<TenantContextService>(TenantContextService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getStreetViewData', () => {
    it('deve retornar cache quando existe', async () => {
      jest.spyOn(orderRepository, 'findOne').mockResolvedValue(mockOrder as Order);
      jest.spyOn(streetViewCacheRepository, 'findOne').mockResolvedValue(mockCache as StreetViewCache);

      const result = await service.getStreetViewData(1);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('orderId', 1);
      expect(result).toHaveProperty('hasStreetView', true);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('deve buscar API e salvar cache quando não existe', async () => {
      jest.spyOn(orderRepository, 'findOne').mockResolvedValue(mockOrder as Order);
      jest.spyOn(streetViewCacheRepository, 'findOne')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockCache as StreetViewCache);
      mockedAxios.get.mockResolvedValue({ data: mockStreetViewApiResponse });

      const result = await service.getStreetViewData(1);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('orderId', 1);
      expect(mockedAxios.get).toHaveBeenCalled();
      expect(streetViewCacheRepository.save).toHaveBeenCalled();
    });

    it('deve lançar NotFoundException quando pedido não existe', async () => {
      jest.spyOn(orderRepository, 'findOne').mockResolvedValue(null);

      await expect(service.getStreetViewData(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('invalidateCache', () => {
    it('deve deletar cache', async () => {
      await service.invalidateCache(1);

      expect(streetViewCacheRepository.delete).toHaveBeenCalledWith({
        order_id: 1,
        id_company: 1000,
      });
    });
  });

  describe('getStreetViewDataBatch', () => {
    it('deve retornar array de resultados', async () => {
      jest.spyOn(orderRepository, 'findOne').mockResolvedValue(mockOrder as Order);
      jest.spyOn(streetViewCacheRepository, 'findOne').mockResolvedValue(mockCache as StreetViewCache);

      const result = await service.getStreetViewDataBatch([1, 2]);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(2);
    });

    it('deve incluir resultado com success:false para pedidos que falham', async () => {
      jest.spyOn(orderRepository, 'findOne')
        .mockResolvedValueOnce(mockOrder as Order)
        .mockResolvedValueOnce(null);

      jest.spyOn(streetViewCacheRepository, 'findOne').mockResolvedValue(mockCache as StreetViewCache);

      const result = await service.getStreetViewDataBatch([1, 2]);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('success', true);
      expect(result[1]).toHaveProperty('success', false);
      expect(result[1]).toHaveProperty('orderId', 2);
    });
  });
});
