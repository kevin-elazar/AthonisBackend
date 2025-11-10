import { PartialType } from '@nestjs/mapped-types';
import { CreateOrderDto } from './create-order.dto';

/**
 * DTO para atualização de pedidos
 * Todos os campos do CreateOrderDto são opcionais
 */
export class UpdateOrderDto extends PartialType(CreateOrderDto) {}
