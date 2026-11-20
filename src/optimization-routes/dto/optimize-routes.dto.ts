import { IsArray, IsNotEmpty, ArrayMinSize, IsNumber, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OptimizeRoutesDto {
  @ApiProperty({
    description: 'Lista de IDs dos pedidos para otimização',
    example: [1, 2, 3, 4, 5],
    type: [Number],
  })
  @IsArray({ message: 'Lista de IDs dos pedidos deve ser um array' })
  @ArrayMinSize(1, { message: 'É necessário pelo menos 1 pedido para otimização' })
  @IsNumber({}, { each: true, message: 'Cada ID deve ser um número' })
  @IsNotEmpty({ message: 'Lista de IDs dos pedidos é obrigatória' })
  orderIds!: number[];

  @ApiPropertyOptional({
    description:
      'Dia da entrega (AAAA-MM-DD). Todos os pedidos vão para este dia e a data de entrega deles é atualizada. ' +
      'Sem ele, sai uma rota por dia de entrega dos pedidos.',
    example: '2026-11-20',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Informe o dia da rota no formato AAAA-MM-DD' })
  plannedDate?: string;
}
