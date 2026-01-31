import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere } from 'typeorm';
import { Order } from '../../../shared/entities/order.entity';
import { Client } from '../../../shared/entities/client.entity';
import { Vehicle } from '../../../shared/entities/vehicle.entity';
import { Driver } from '../../../shared/entities/driver.entity';
import { CreateOrderDto } from '../dto/create-order.dto';
import { UpdateOrderDto } from '../dto/update-order.dto';
import { FindOrderDto } from '../dto/find-order.dto';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
    @InjectRepository(Vehicle)
    private vehicleRepository: Repository<Vehicle>,
    @InjectRepository(Driver)
    private driverRepository: Repository<Driver>,
    private tenantContext: TenantContextService,
  ) {}

  async create(createOrderDto: CreateOrderDto) {
    try {
      const idCompany = this.tenantContext.getIdCompany();
      await this.validateOrderReferences(createOrderDto.client_id, createOrderDto.vehicle_id, createOrderDto.driver_id, idCompany);

      // Normalizar IDs: converter 0 para undefined (NULL no banco)
      const normalizedDto = {
        ...createOrderDto,
        vehicle_id: createOrderDto.vehicle_id === 0 ? undefined : createOrderDto.vehicle_id,
        driver_id: createOrderDto.driver_id === 0 ? undefined : createOrderDto.driver_id,
      };

      const user = this.tenantContext.getUser();
      const createdBy = user?.email ?? undefined;

      const order = this.orderRepository.create({
        ...normalizedDto,
        id_company: idCompany,
        created_by: createdBy,
      });
      const savedOrder = await this.orderRepository.save(order);
      
      // Recarregar com relações para retornar os nomes
      return await this.orderRepository.findOne({
        where: { order_id: savedOrder.order_id, id_company: idCompany },
        relations: ['client', 'driver', 'vehicle']
      });
    } catch (error) {
      this.logger.error('Error creating order:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        data: createOrderDto
      });

      if (error instanceof Error) {
        // Mensagens mais amigáveis para erros comuns
        if (error.message.includes('FOREIGN KEY constraint failed')) {
          throw new BadRequestException({
            message: 'IDs inválidos fornecidos',
            error: 'Um ou mais IDs (client_id, vehicle_id ou driver_id) não existem no banco de dados',
            hint: 'Verifique se os IDs fornecidos existem e estão corretos'
          });
        }

        throw new BadRequestException({
          message: 'Erro ao criar pedido',
          error: error.message,
        });
      }

      throw error;
    }
  }

  async findAll(query: FindOrderDto) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        title, 
        urgency,
        sort_by = 'order_id',
        order = 'DESC' 
      } = query;
  
      const where = this.buildSearchConditions({ title, urgency });
      where.id_company = this.tenantContext.getIdCompany();
  
      const allowedFields = ['title', 'urgency', 'order_id'];
      if (!allowedFields.includes(sort_by)) {
        throw new BadRequestException(`Invalid sort field. Allowed: ${allowedFields.join(', ')}`);
      }
  
      const [items, total] = await this.orderRepository.findAndCount({
        where,
        relations: ['client', 'driver', 'vehicle'],
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
      throw new InternalServerErrorException('Error finding orders');
    }
  }

  private buildSearchConditions({ title, urgency }: Partial<FindOrderDto>) {
    const where: FindOptionsWhere<Order> = {};

    if (title) {
      where.title = Like(`%${title.trim()}%`);
    }

    if (urgency) {
      where.urgency = urgency;
    }

    return where;
  }

  async findOne(id: string) {
    const idCompany = this.tenantContext.getIdCompany();
    const order = await this.orderRepository.findOne({ 
      where: { order_id: Number(id), id_company: idCompany },
      relations: ['client', 'driver', 'vehicle']
    });
    if (!order) {
      throw new NotFoundException(`Order ID ${id} not found`);
    }
    return order;
  }

  async update(id: string, updateOrderDto: UpdateOrderDto) {
    const order = await this.findOne(id);
    const idCompany = this.tenantContext.getIdCompany();
    if (updateOrderDto.client_id || updateOrderDto.vehicle_id || updateOrderDto.driver_id) {
      await this.validateOrderReferences(
        updateOrderDto.client_id ?? order.client_id,
        updateOrderDto.vehicle_id ?? order.vehicle_id ?? 0,
        updateOrderDto.driver_id ?? order.driver_id ?? 0,
        idCompany
      );
    }

    const user = this.tenantContext.getUser();
    const updatedBy = user?.email ?? undefined;

    Object.assign(order, { ...updateOrderDto, updated_by: updatedBy });
    const updatedOrder = await this.orderRepository.save(order);
    
    // Recarregar com relações para retornar os nomes
    return await this.orderRepository.findOne({
      where: { order_id: updatedOrder.order_id, id_company: idCompany },
      relations: ['client', 'driver', 'vehicle']
    });
  }

  private async validateOrderReferences(clientId: number, vehicleId?: number, driverId?: number, idCompany?: number): Promise<void> {
    const company = idCompany ?? this.tenantContext.getIdCompany();
    const client = await this.clientRepository.findOne({ where: { client_id: clientId, id_company: company } });
    if (!client) {
      throw new BadRequestException(`Cliente com ID ${clientId} não existe ou não pertence à sua empresa`);
    }
    if (vehicleId) {
      const vehicle = await this.vehicleRepository.findOne({ where: { vehicle_id: vehicleId, id_company: company } });
      if (!vehicle) {
        throw new BadRequestException(`Veículo com ID ${vehicleId} não existe ou não pertence à sua empresa`);
      }
    }
    if (driverId) {
      const driver = await this.driverRepository.findOne({ where: { driver_id: driverId, id_company: company } });
      if (!driver) {
        throw new BadRequestException(`Motorista com ID ${driverId} não existe ou não pertence à sua empresa`);
      }
    }
  }

  async remove(id: string) {
    const order = await this.findOne(id);
    return await this.orderRepository.remove(order);
  }
}
