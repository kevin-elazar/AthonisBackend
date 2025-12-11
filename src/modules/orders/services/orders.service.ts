import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere } from 'typeorm';
import { Order } from '../../../shared/entities/order.entity';
import { CreateOrderDto } from '../dto/create-order.dto';
import { UpdateOrderDto } from '../dto/update-order.dto';
import { FindOrderDto } from '../dto/find-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) {}

  async create(createOrderDto: CreateOrderDto) {
    try {
      // Normalizar IDs: converter 0 para undefined (NULL no banco)
      const normalizedDto = {
        ...createOrderDto,
        vehicle_id: createOrderDto.vehicle_id === 0 ? undefined : createOrderDto.vehicle_id,
        driver_id: createOrderDto.driver_id === 0 ? undefined : createOrderDto.driver_id,
      };

      const order = this.orderRepository.create(normalizedDto);
      const savedOrder = await this.orderRepository.save(order);
      
      // Recarregar com relações para retornar os nomes
      return await this.orderRepository.findOne({
        where: { order_id: savedOrder.order_id },
        relations: ['client', 'driver', 'vehicle']
      });
    } catch (error) {
      console.error('Error creating order:', {
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
        sort_by = 'created_at',
        order = 'DESC' 
      } = query;
  
      const where = this.buildSearchConditions({ title, urgency });
  
      const allowedFields = ['title', 'urgency', 'delivery_date', 'created_at'];
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
    const order = await this.orderRepository.findOne({ 
      where: { order_id: Number(id) },
      relations: ['client', 'driver', 'vehicle']
    });
    if (!order) {
      throw new NotFoundException(`Order ID ${id} not found`);
    }
    return order;
  }

  async update(id: string, updateOrderDto: UpdateOrderDto) {
    const order = await this.findOne(id);
    Object.assign(order, updateOrderDto);
    const updatedOrder = await this.orderRepository.save(order);
    
    // Recarregar com relações para retornar os nomes
    return await this.orderRepository.findOne({
      where: { order_id: updatedOrder.order_id },
      relations: ['client', 'driver', 'vehicle']
    });
  }

  async remove(id: string) {
    const order = await this.findOne(id);
    return await this.orderRepository.remove(order);
  }
}
