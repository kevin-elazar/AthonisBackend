import { IsNotEmpty, IsString, IsNumber, IsOptional, IsDate, Length, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrderDto {
  @ApiProperty({ description: 'ID do cliente', example: 1 })
  @IsNotEmpty()
  @IsNumber()
  client_id: number;

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

  @ApiProperty({ description: 'Urgência do pedido', example: 'normal' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  urgency: string;

  @ApiProperty({ description: 'ID do veículo (opcional)', required: false })
  @IsOptional()
  @IsNumber()
  vehicle_id?: number;

  @ApiProperty({ description: 'ID do motorista (opcional)', required: false })
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
