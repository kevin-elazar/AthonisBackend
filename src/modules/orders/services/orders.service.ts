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
      const order = this.orderRepository.create(createOrderDto);
      console.log('Creating order with data:', JSON.stringify(createOrderDto, null, 2));
      
      return await this.orderRepository.save(order);
    } catch (error) {
      console.error('Error creating order:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        data: createOrderDto
      });

      if (
        typeof error === 'object' && 
        error !== null && 
        'driverError' in error && 
        error.driverError && 
        typeof error.driverError === 'object' &&
        'detail' in error.driverError
      ) {
        throw new BadRequestException(error.driverError.detail);
      }

      if (error instanceof Error) {
        throw new BadRequestException({
          message: 'Error creating order',
          error: error.message,
          details: JSON.stringify(createOrderDto)
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
    const order = await this.orderRepository.findOne({ where: { order_id: Number(id) } });
    if (!order) {
      throw new NotFoundException(`Order ID ${id} not found`);
    }
    return order;
  }

  async update(id: string, updateOrderDto: UpdateOrderDto) {
    const order = await this.findOne(id);
    Object.assign(order, updateOrderDto);
    return await this.orderRepository.save(order);
  }

  async remove(id: string) {
    const order = await this.findOne(id);
    return await this.orderRepository.remove(order);
  }
}
