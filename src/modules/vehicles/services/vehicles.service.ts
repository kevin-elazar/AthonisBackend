import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere } from 'typeorm';
import { Vehicle } from '../../../shared/entities/vehicle.entity';
import { CreateVehicleDto } from '../dto/create-vehicle.dto';
import { UpdateVehicleDto } from '../dto/update-vehicle.dto';
import { FindVehicleDto } from '../dto/find-vehicle.dto';

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(Vehicle)
    private vehicleRepository: Repository<Vehicle>,
  ) {}

  async create(createVehicleDto: CreateVehicleDto) {
    const vehicle = this.vehicleRepository.create(createVehicleDto);
    return await this.vehicleRepository.save(vehicle);
  }

  async findAll(query: FindVehicleDto) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        name, 
        brand,
        sort_by = 'name',
        order = 'ASC' 
      } = query;
  
      const where = this.buildSearchConditions({ name, brand });
  
      const allowedFields = ['name', 'brand', 'model', 'year'];
      if (!allowedFields.includes(sort_by)) {
        throw new BadRequestException(`Invalid sort field. Allowed: ${allowedFields.join(', ')}`);
      }
  
      const [items, total] = await this.vehicleRepository.findAndCount({
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
      throw new InternalServerErrorException('Error finding vehicles');
    }
  }

  private buildSearchConditions({ name, brand }: Partial<FindVehicleDto>) {
    const where: FindOptionsWhere<Vehicle> = {};

    if (name) {
      where.name = Like(`%${name.trim()}%`);
    }

    if (brand) {
      where.brand = Like(`%${brand.trim()}%`);
    }

    return where;
  }

  async findOne(id: string) {
    const vehicle = await this.vehicleRepository.findOne({ where: { vehicle_id: Number(id) } });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ID ${id} not found`);
    }
    return vehicle;
  }

  async update(id: string, updateVehicleDto: UpdateVehicleDto) {
    const vehicle = await this.findOne(id);
    Object.assign(vehicle, updateVehicleDto);
    return await this.vehicleRepository.save(vehicle);
  }

  async remove(id: string) {
    const vehicle = await this.findOne(id);
    return await this.vehicleRepository.remove(vehicle);
  }
}
