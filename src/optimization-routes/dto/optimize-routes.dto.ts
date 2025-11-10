import { IsArray, IsNotEmpty, ArrayMinSize, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OptimizeRoutesDto {
  @ApiProperty({ 
    description: 'Lista de IDs dos pedidos para otimização', 
    example: [1, 2, 3, 4, 5],
    type: [Number]
  })
  @IsArray({ message: 'Lista de IDs dos pedidos deve ser um array' })
  @ArrayMinSize(1, { message: 'É necessário pelo menos 1 pedido para otimização' })
  @IsNumber({}, { each: true, message: 'Cada ID deve ser um número' })
  @IsNotEmpty({ message: 'Lista de IDs dos pedidos é obrigatória' })
  orderIds!: number[];
}
