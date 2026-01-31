import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientsService } from '@/modules/clients/services/clients.service';
import { Client } from '@/shared/entities/client.entity';
import { TenantContextService } from '@/shared/tenant/tenant-context.service';
import { createClientDto } from '../fixtures/client.fixtures';

describe('ClientsService', () => {
  let service: ClientsService;
  let clientRepository: Repository<Client>;
  let tenantContext: TenantContextService;

  const mockClient = {
    client_id: 1,
    id_company: 1000,
    name: 'João Silva',
    document: '12345678900',
    type: 'F',
    street: 'Rua das Flores',
    neighborhood: 'Centro',
    city: 'São Paulo',
    state: 'SP',
    zip_code: '01234-567',
    number: '123',
    created_by: 'admin@athonis.com',
    updated_by: undefined,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        {
          provide: getRepositoryToken(Client),
          useValue: {
            create: jest.fn().mockImplementation((dto) => ({ ...dto, client_id: 1 })),
            save: jest.fn().mockImplementation((client) => Promise.resolve({ ...client, client_id: 1 })),
            findOne: jest.fn(),
            findAndCount: jest.fn().mockResolvedValue([[mockClient], 1]),
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

    service = module.get<ClientsService>(ClientsService);
    clientRepository = module.get<Repository<Client>>(getRepositoryToken(Client));
    tenantContext = module.get<TenantContextService>(TenantContextService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('deve criar cliente com created_by', async () => {
      const result = await service.create(createClientDto);

      expect(result).toHaveProperty('created_by', 'admin@athonis.com');
      expect(clientRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...createClientDto,
          id_company: 1000,
          created_by: 'admin@athonis.com',
        }),
      );
    });
  });

  describe('update', () => {
    it('deve atualizar cliente com updated_by', async () => {
      jest.spyOn(clientRepository, 'findOne').mockResolvedValue(mockClient as Client);

      const result = await service.update('1', { name: 'João Silva Atualizado' });

      expect(result).toHaveProperty('name', 'João Silva Atualizado');
      expect(clientRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          updated_by: 'admin@athonis.com',
        }),
      );
    });
  });

  describe('findOne', () => {
    it('deve lançar NotFoundException quando cliente não existe', async () => {
      jest.spyOn(clientRepository, 'findOne').mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });

    it('deve retornar cliente quando existe', async () => {
      jest.spyOn(clientRepository, 'findOne').mockResolvedValue(mockClient as Client);

      const result = await service.findOne('1');

      expect(result).toEqual(mockClient);
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
  });
});
