import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export class FindAnalyticsDto {
  @ApiProperty({
    description: 'Primeiro dia do período (AAAA-MM-DD). Sem valor, 29 dias antes de `to`.',
    required: false,
    example: '2026-09-09',
  })
  @IsOptional()
  @Matches(DIA, { message: 'from deve estar no formato AAAA-MM-DD' })
  from?: string;

  @ApiProperty({
    description: 'Último dia do período (AAAA-MM-DD). Sem valor, hoje no fuso da empresa.',
    required: false,
    example: '2026-10-08',
  })
  @IsOptional()
  @Matches(DIA, { message: 'to deve estar no formato AAAA-MM-DD' })
  to?: string;
}
