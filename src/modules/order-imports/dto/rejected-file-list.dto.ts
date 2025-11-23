import { ApiProperty } from '@nestjs/swagger';

export class RejectedFileDto {
  @ApiProperty({ 
    description: 'Nome do arquivo de rejeição', 
    example: 'REJEICAO_pedidos_20241120_153045.csv' 
  })
  filename: string;

  @ApiProperty({ 
    description: 'Tamanho do arquivo em bytes', 
    example: 1024 
  })
  size: number;

  @ApiProperty({ 
    description: 'Tamanho do arquivo formatado (KB, MB)', 
    example: '1.5 KB' 
  })
  sizeFormatted: string;

  @ApiProperty({ 
    description: 'Data de criação do arquivo', 
    example: '2024-11-20T15:30:45.000Z' 
  })
  createdAt: Date;

  @ApiProperty({ 
    description: 'Data da última modificação do arquivo', 
    example: '2024-11-20T15:30:45.000Z' 
  })
  modifiedAt: Date;
}

export class RejectedFileListDto {
  @ApiProperty({ 
    description: 'Lista de arquivos de rejeição', 
    type: [RejectedFileDto] 
  })
  files: RejectedFileDto[];

  @ApiProperty({ 
    description: 'Total de arquivos de rejeição encontrados', 
    example: 5 
  })
  total: number;
}

