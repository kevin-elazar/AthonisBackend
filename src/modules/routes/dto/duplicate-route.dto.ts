import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, Matches, Min } from 'class-validator';

/**
 * Tudo opcional: sem nada, a rota nova sai para hoje, com o mesmo motorista
 * e o mesmo veículo da rota cancelada.
 */
export class DuplicateRouteDto {
  @ApiProperty({
    description: 'Dia da nova rota (AAAA-MM-DD). Sem valor, hoje no fuso da empresa.',
    required: false,
    example: '2026-10-16',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'planned_date deve estar no formato AAAA-MM-DD' })
  planned_date?: string;

  @ApiProperty({ description: 'Motorista da nova rota. Sem valor, o da rota cancelada.', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  driver_id?: number;

  @ApiProperty({ description: 'Veículo da nova rota. Sem valor, o da rota cancelada.', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  vehicle_id?: number;
}
