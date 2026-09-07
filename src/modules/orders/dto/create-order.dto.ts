import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsIn,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ORDER_STATUSES,
  ORDER_URGENCIES,
  OrderStatus,
  OrderUrgency,
  normalizeUrgency,
} from '../../../shared/domain/enums';

export class CreateOrderDto {
  @ApiProperty({
    description: 'ID do cliente (opcional — omita para uma entrega avulsa)',
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  client_id?: number;

  @ApiProperty({ description: 'Título do pedido', example: 'Entrega de mercadorias' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  title: string;

  @ApiProperty({ description: 'Descrição do pedido (opcional)', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Número da nota fiscal (opcional)', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  invoice_number?: string;

  @ApiProperty({
    description: 'Urgência do pedido',
    enum: ORDER_URGENCIES,
    example: 'normal',
  })
  @IsNotEmpty({ message: 'Urgência é obrigatória' })
  // Aceita os termos legados ("urgente", "alta", "baixa") e grava sempre o
  // valor canônico, para o banco ter um vocabulário só.
  @Transform(({ value }) => normalizeUrgency(value) ?? value)
  @IsIn(ORDER_URGENCIES, {
    message: 'Urgência deve ser uma de: low, normal, high, critical',
  })
  urgency: OrderUrgency;

  @ApiProperty({
    description: 'Status do pedido no ciclo de entrega',
    enum: ORDER_STATUSES,
    required: false,
    default: 'pending',
  })
  @IsOptional()
  @IsIn(ORDER_STATUSES, {
    message: 'Status deve ser um de: pending, planned, in_route, delivered, delayed, cancelled',
  })
  status?: OrderStatus;

  @ApiProperty({
    description: 'Janela de entrega combinada com o cliente',
    example: '08:00 - 12:00',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  delivery_window?: string;

  @ApiProperty({ description: 'Valor do pedido', example: 1250.9, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  value?: number;

  @ApiProperty({ description: 'Data prevista de entrega (ISO)', required: false })
  @IsOptional()
  @IsDateString()
  delivery_date?: string;

  @ApiProperty({ 
    description: 'ID do veículo (opcional - omita ou envie null se não tiver)', 
    required: false,
    example: 1
  })
  @IsOptional()
  @IsNumber()
  vehicle_id?: number;

  @ApiProperty({ 
    description: 'ID do motorista (opcional - omita ou envie null se não tiver)', 
    required: false,
    example: 1
  })
  @IsOptional()
  @IsNumber()
  driver_id?: number;

  /*@IsOptional()
  @Type(() => Date)
  @IsDate()
  delivery_date?: Date;*/

  @ApiProperty({ description: 'Quantidade', example: 10 })
  @IsNotEmpty()
  @IsNumber()
  quantity: number;

  @ApiProperty({ description: 'Rua do endereço de entrega', example: 'Rua das Flores' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  delivery_street: string;

  @ApiProperty({ description: 'Bairro do endereço de entrega', example: 'Centro' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  delivery_district: string;

  @ApiProperty({ description: 'Cidade de entrega', example: 'São Paulo' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  delivery_city: string;

  @ApiProperty({ description: 'Estado de entrega', example: 'SP' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  delivery_state: string;

  @ApiProperty({ description: 'CEP de entrega', example: '01234-567' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(10)
  delivery_zipcode: string;

  @ApiProperty({ description: 'Número do endereço de entrega', example: '123' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(10)
  delivery_number: string;

  @ApiProperty({ description: 'Complemento do endereço (opcional)', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  delivery_complement?: string;

  //@IsNotEmpty()/*
  /*
  @IsOptional()
  @IsString()
  @MaxLength(50)
  created_by: string;*/
}
