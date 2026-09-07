import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { promises as fs } from 'fs';
import { OrderImportsService } from '@/modules/order-imports/services/order-imports.service';
import { Client } from '@/shared/entities/client.entity';
import { Vehicle } from '@/shared/entities/vehicle.entity';
import { Driver } from '@/shared/entities/driver.entity';
import { OrdersService } from '@/modules/orders/services/orders.service';
import { TenantContextService } from '@/shared/tenant/tenant-context.service';

jest.mock('fs', () => {
  const actualFs = jest.requireActual<typeof import('fs')>('fs');
  return {
    ...actualFs,
    promises: {
      access: jest.fn(),
      readdir: jest.fn(),
      stat: jest.fn(),
      mkdir: jest.fn(),
      writeFile: jest.fn(),
    },
  };
});

describe('OrderImportsService', () => {

  /** Conjuntos de referencias validas usados pelo novo validateReferences. */
  const refs = () => ({
    clientIds: new Set<number>([1]),
    vehicleIds: new Set<number>([1]),
    driverIds: new Set<number>([1]),
  });
  let service: OrderImportsService;
  let clientRepository: Repository<Client>;
  let vehicleRepository: Repository<Vehicle>;
  let driverRepository: Repository<Driver>;
  let ordersService: OrdersService;
  let tenantContext: TenantContextService;

  const mockClient = { client_id: 1, id_company: 1000 };
  const mockVehicle = { vehicle_id: 1, id_company: 1000 };
  const mockDriver = { driver_id: 1, id_company: 1000 };

  beforeEach(async () => {
    jest.clearAllMocks();
    (fs.access as jest.Mock).mockResolvedValue(undefined);
    (fs.readdir as jest.Mock).mockResolvedValue([]);
    (fs.stat as jest.Mock).mockResolvedValue({
      size: 1024,
      birthtime: new Date(),
      mtime: new Date(),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderImportsService,
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
          provide: OrdersService,
          useValue: {
            create: jest.fn(),
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

    service = module.get<OrderImportsService>(OrderImportsService);
    clientRepository = module.get<Repository<Client>>(getRepositoryToken(Client));
    vehicleRepository = module.get<Repository<Vehicle>>(getRepositoryToken(Vehicle));
    driverRepository = module.get<Repository<Driver>>(getRepositoryToken(Driver));
    ordersService = module.get<OrdersService>(OrdersService);
    tenantContext = module.get<TenantContextService>(TenantContextService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateReferences', () => {
    it('deve retornar isValid:true quando todas FKs existem', async () => {
      const result = service.validateReferences(
        { client_id: 1, vehicle_id: 1, driver_id: 1 },
        refs(),
      );

      expect(result).toHaveProperty('isValid', true);
      expect(result).toHaveProperty('errors', []);
    });

    it('deve retornar erros quando client_id inválido', async () => {
      const result = service.validateReferences({ client_id: 999 }, refs());

      expect(result).toHaveProperty('isValid', false);
      expect(result.errors).toContain(
        'Cliente com ID 999 não existe no sistema ou não pertence à sua empresa',
      );
    });

    it('deve retornar erros quando vehicle_id inválido', async () => {
      const result = service.validateReferences(
        { client_id: 1, vehicle_id: 999 },
        refs(),
      );

      expect(result).toHaveProperty('isValid', false);
      expect(result.errors).toContain(
        'Veículo com ID 999 não existe no sistema ou não pertence à sua empresa',
      );
    });

    it('deve retornar erros quando driver_id inválido', async () => {
      const result = service.validateReferences(
        { client_id: 1, driver_id: 999 },
        refs(),
      );

      expect(result).toHaveProperty('isValid', false);
      expect(result.errors).toContain(
        'Motorista com ID 999 não existe no sistema ou não pertence à sua empresa',
      );
    });
  });

  describe('getRejectedFilePath', () => {
    it('deve retornar path quando arquivo existe', async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);

      const result = await service.getRejectedFilePath('REJEICAO_arquivo_20240101.csv');

      expect(result).toContain('REJEICAO_arquivo_20240101.csv');
    });

    it('deve lançar BadRequestException para filename com path traversal', async () => {
      await expect(service.getRejectedFilePath('../../../etc/passwd')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getRejectedFilePath('file/name.csv')).rejects.toThrow(BadRequestException);
      await expect(service.getRejectedFilePath('file\\name.csv')).rejects.toThrow(BadRequestException);
    });

    it('deve lançar NotFoundException quando arquivo não existe', async () => {
      (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      await expect(service.getRejectedFilePath('arquivo_inexistente.csv')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listRejectedFiles', () => {
    it('deve retornar lista vazia quando diretório não existe', async () => {
      (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      const result = await service.listRejectedFiles();

      expect(result).toHaveProperty('files', []);
      expect(result).toHaveProperty('total', 0);
    });

    it('deve retornar arquivos filtrados por dataInicio e dataFim', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue([
        'REJEICAO_arquivo_20240101.csv',
        'REJEICAO_arquivo_20240115.csv',
      ]);
      (fs.stat as jest.Mock)
        .mockResolvedValueOnce({
          size: 1024,
          birthtime: new Date('2024-01-01'),
          mtime: new Date('2024-01-01'),
        })
        .mockResolvedValueOnce({
          size: 2048,
          birthtime: new Date('2024-01-15'),
          mtime: new Date('2024-01-15'),
        });

      const result = await service.listRejectedFiles({
        dataInicio: '2024-01-01',
        dataFim: '2024-01-31',
      });

      expect(result).toHaveProperty('files');
      expect(result).toHaveProperty('total');
    });

    it('deve lançar BadRequestException quando dataInicio > dataFim', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue(['REJEICAO_arquivo.csv']);
      (fs.stat as jest.Mock).mockResolvedValue({
        size: 1024,
        birthtime: new Date(),
        mtime: new Date(),
      });

      await expect(
        service.listRejectedFiles({
          dataInicio: '2024-01-31',
          dataFim: '2024-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
