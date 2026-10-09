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
