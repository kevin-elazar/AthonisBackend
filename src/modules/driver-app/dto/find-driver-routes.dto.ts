import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export class FindDriverRoutesDto {
  @ApiProperty({
    description: 'Dia das rotas (AAAA-MM-DD). Sem valor, usa o dia de hoje no fuso da empresa.',
    required: false,
    example: '2026-10-08',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date deve estar no formato AAAA-MM-DD' })
  date?: string;
}

export class FindDriverRoutesRangeDto {
  @ApiProperty({ description: 'Primeiro dia (AAAA-MM-DD)', example: '2026-11-10' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from deve estar no formato AAAA-MM-DD' })
  from!: string;

  @ApiProperty({ description: 'Último dia (AAAA-MM-DD), no máximo 62 dias depois de from', example: '2026-11-30' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to deve estar no formato AAAA-MM-DD' })
  to!: string;
}
