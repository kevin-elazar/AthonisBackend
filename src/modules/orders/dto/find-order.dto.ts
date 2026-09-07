import { IsOptional, IsString, IsInt, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ORDER_STATUSES,
  ORDER_URGENCIES,
  OrderStatus,
  OrderUrgency,
} from '../../../shared/domain/enums';

export class FindOrderDto {
  @ApiProperty({ description: 'Numero da pagina', example: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ description: 'Itens por pagina', example: 10, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiProperty({ description: 'Titulo do pedido', example: 'Entrega', required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({
    description: 'Urgencia do pedido',
    enum: ORDER_URGENCIES,
    required: false,
  })
  @IsOptional()
  @IsIn(ORDER_URGENCIES)
  urgency?: OrderUrgency;

  @ApiProperty({
    description: 'Status do pedido',
    enum: ORDER_STATUSES,
    required: false,
  })
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: OrderStatus;

  @ApiProperty({ description: 'Cliente do pedido', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  client_id?: number;

  @ApiProperty({ description: 'Campo para ordenacao', example: 'title', required: false })
  @IsOptional()
  @IsString()
  sort_by?: string;

  @ApiProperty({
    description: 'Ordem de classificacao',
    enum: ['ASC', 'DESC'],
    example: 'ASC',
    required: false,
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC';
}
