import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere } from 'typeorm';
import { Client } from '../../../shared/entities/client.entity';
import { CreateClientDto } from '../dto/create-client.dto';
import { UpdateClientDto } from '../dto/update-client.dto';
import { FindClientDto } from '../dto/find-client.dto';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
    private tenantContext: TenantContextService,
  ) {}

  async create(createClientDto: CreateClientDto) {
    const idCompany = this.tenantContext.getIdCompany();
    const user = this.tenantContext.getUser();
    const createdBy = user?.email ?? undefined;

    const client = this.clientRepository.create({
      ...createClientDto,
      id_company: idCompany,
      created_by: createdBy,
    });
    return await this.clientRepository.save(client);
  }

  async findAll(query: FindClientDto) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        name, 
        document, 
        type,
        sort_by = 'name',
        order = 'ASC' 
      } = query;
  
      const where = this.buildSearchConditions({ name, document, type });
      where.id_company = this.tenantContext.getIdCompany();
  
      const allowedFields = ['name', 'document', 'type', 'created_at'];
      if (!allowedFields.includes(sort_by)) {
        throw new BadRequestException(`Invalid sort field. Allowed: ${allowedFields.join(', ')}`);
      }
  
      const [items, total] = await this.clientRepository.findAndCount({
        where,
        order: { [sort_by]: order },
        skip: (page - 1) * limit,
        take: limit,
        cache: true
      });
  
      return {
        items,
        meta: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Error finding clients');
    }
  }

  private buildSearchConditions({ name, document, type }: Partial<FindClientDto>) {
    const where: FindOptionsWhere<Client> = {};

    if (name) {
      where.name = Like(`%${name.trim()}%`);
    }

    if (document) {
      where.document = document.replace(/[^0-9]/g, '');
    }

    if (type) {
      where.type = type;
    }

    return where;
  }

  async findOne(id: string) {
    const idCompany = this.tenantContext.getIdCompany();
    const client = await this.clientRepository.findOne({ where: { client_id: Number(id), id_company: idCompany } });
    if (!client) {
      throw new NotFoundException(`Client ID ${id} not found`);
    }
    return client;
  }

  async update(id: string, updateClientDto: UpdateClientDto) {
    const client = await this.findOne(id);
    const user = this.tenantContext.getUser();
    const updatedBy = user?.email ?? undefined;

    Object.assign(client, { ...updateClientDto, updated_by: updatedBy });
    return await this.clientRepository.save(client);
  }

  async remove(id: string) {
    const client = await this.findOne(id);
    return await this.clientRepository.remove(client);
  }
}
