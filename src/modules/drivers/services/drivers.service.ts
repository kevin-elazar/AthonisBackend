import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere } from 'typeorm';
import { Driver } from '../../../shared/entities/driver.entity';
import { CreateDriverDto } from '../dto/create-driver.dto';
import { UpdateDriverDto } from '../dto/update-driver.dto';
import { FindDriverDto } from '../dto/find-driver.dto';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';

@Injectable()
export class DriversService {
  constructor(
    @InjectRepository(Driver)
    private driverRepository: Repository<Driver>,
    private tenantContext: TenantContextService,
  ) {}

  async create(createDriverDto: CreateDriverDto) {
    const idCompany = this.tenantContext.getIdCompany();
    const driver = this.driverRepository.create({ ...createDriverDto, id_company: idCompany });
    return await this.driverRepository.save(driver);
  }

  async findAll(query: FindDriverDto) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        name, 
        document,
        sort_by = 'name',
        order = 'ASC' 
      } = query;
  
      const where = this.buildSearchConditions({ name, document });
      where.id_company = this.tenantContext.getIdCompany();
  
      const allowedFields = ['name', 'document', 'birth_date'];
      if (!allowedFields.includes(sort_by)) {
        throw new BadRequestException(`Invalid sort field. Allowed: ${allowedFields.join(', ')}`);
      }
  
      const [items, total] = await this.driverRepository.findAndCount({
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
      throw new InternalServerErrorException('Error finding drivers');
    }
  }

  private buildSearchConditions({ name, document }: Partial<FindDriverDto>) {
    const where: FindOptionsWhere<Driver> = {};

    if (name) {
      where.name = Like(`%${name.trim()}%`);
    }

    if (document) {
      where.document = document.replace(/[^0-9]/g, '');
    }

    return where;
  }

  async findOne(id: string) {
    const idCompany = this.tenantContext.getIdCompany();
    const driver = await this.driverRepository.findOne({ where: { driver_id: Number(id), id_company: idCompany } });
    if (!driver) {
      throw new NotFoundException(`Driver ID ${id} not found`);
    }
    return driver;
  }

  async update(id: string, updateDriverDto: UpdateDriverDto) {
    const driver = await this.findOne(id);
    Object.assign(driver, updateDriverDto);
    return await this.driverRepository.save(driver);
  }

  async remove(id: string) {
    const driver = await this.findOne(id);
    return await this.driverRepository.remove(driver);
  }
}
