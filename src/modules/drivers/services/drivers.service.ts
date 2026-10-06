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
    const user = this.tenantContext.getUser();
    const createdBy = user?.email ?? undefined;

    const driver = this.driverRepository.create({
      ...createDriverDto,
      id_company: idCompany,
      created_by: createdBy,
    });
    return await this.driverRepository.save(driver);
  }

  async findAll(query: FindDriverDto) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        name, 
        document,
        status,
        sort_by = 'name',
        order = 'ASC' 
      } = query;
  
      const where = this.buildSearchConditions({ name, document, status });
      where.id_company = this.tenantContext.getIdCompany();
  
      const allowedFields = ['name', 'document', 'birth_date'];
      if (!allowedFields.includes(sort_by)) {
        throw new BadRequestException(`Invalid sort field. Allowed: ${allowedFields.join(', ')}`);
      }
  
      const [items, total] = await this.driverRepository.findAndCount({
        where,
        order: { [sort_by]: order },
        skip: (page - 1) * limit,
        take: limit
      });
  
      const withMetrics = await this.attachDeliveryMetrics(items);

      return {
        items: withMetrics,
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

  /**
   * Entregas concluidas e taxa de sucesso por motorista, em uma unica
   * consulta agregada — evita uma query por linha da listagem.
   */
  private async attachDeliveryMetrics(drivers: Driver[]) {
    if (drivers.length === 0) return drivers;

    const idCompany = this.tenantContext.getIdCompany();
    const driverIds = drivers.map((driver) => driver.driver_id);

    const rows = await this.driverRepository.manager
      .createQueryBuilder()
      .select("o.driver_id", "driver_id")
      .addSelect("COUNT(o.order_id)", "total")
      .addSelect(
        "SUM(CASE WHEN o.status = 'delivered' THEN 1 ELSE 0 END)",
        "delivered",
      )
      .from("order", "o")
      .where("o.driver_id IN (:...driverIds)", { driverIds })
      .andWhere("o.id_company = :idCompany", { idCompany })
      .groupBy("o.driver_id")
      .getRawMany();

    const metrics = new Map<number, { total: number; delivered: number }>();
    for (const row of rows) {
      metrics.set(Number(row.driver_id), {
        total: Number(row.total) || 0,
        delivered: Number(row.delivered) || 0,
      });
    }

    return drivers.map((driver) => {
      const entry = metrics.get(driver.driver_id);
      const total = entry?.total ?? 0;
      const delivered = entry?.delivered ?? 0;

      return {
        ...driver,
        delivery_count: delivered,
        // Percentual de pedidos atribuidos que foram efetivamente entregues.
        performance: total > 0 ? Math.round((delivered / total) * 100) : 0,
      };
    });
  }

  private buildSearchConditions({ name, document, status }: Partial<FindDriverDto>) {
    const where: FindOptionsWhere<Driver> = {};

    if (status) {
      where.status = status;
    }

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
    const user = this.tenantContext.getUser();
    const updatedBy = user?.email ?? undefined;

    Object.assign(driver, { ...updateDriverDto, updated_by: updatedBy });
    return await this.driverRepository.save(driver);
  }

  async remove(id: string) {
    const driver = await this.findOne(id);
    return await this.driverRepository.remove(driver);
  }
}
