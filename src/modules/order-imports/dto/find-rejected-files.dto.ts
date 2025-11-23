import { IsOptional, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FindRejectedFilesDto {
  @ApiProperty({ 
    description: 'Data inicial para filtrar arquivos (formato: YYYY-MM-DD). Filtra arquivos modificados a partir desta data.', 
    example: '2025-11-01',
    required: false 
  })
  @IsOptional()
  @IsDateString({}, { message: 'Data inicial deve estar no formato YYYY-MM-DD' })
  dataInicio?: string;

  @ApiProperty({ 
    description: 'Data final para filtrar arquivos (formato: YYYY-MM-DD). Filtra arquivos modificados até esta data.', 
    example: '2025-11-30',
    required: false 
  })
  @IsOptional()
  @IsDateString({}, { message: 'Data final deve estar no formato YYYY-MM-DD' })
  dataFim?: string;
}

