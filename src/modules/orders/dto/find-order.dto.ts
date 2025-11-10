import { IsOptional, IsString, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FindOrderDto {
  @ApiProperty({ description: 'Número da página', example: 1, required: false })
  @IsOptional()
  @IsNumber()
  page?: number;

  @ApiProperty({ description: 'Itens por página', example: 10, required: false })
  @IsOptional()
  @IsNumber()
  limit?: number;

  @ApiProperty({ description: 'Título do pedido', example: 'Entrega', required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ description: 'Urgência do pedido', example: 'normal', required: false })
  @IsOptional()
  @IsString()
  urgency?: string;

  @ApiProperty({ description: 'Campo para ordenação', example: 'title', required: false })
  @IsOptional()
  @IsString()
  sort_by?: string;

  @ApiProperty({ description: 'Ordem de classificação', enum: ['ASC', 'DESC'], example: 'ASC', required: false })
  @IsOptional()
  @IsString()
  order?: 'ASC' | 'DESC';
}
