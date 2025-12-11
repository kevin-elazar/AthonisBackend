import { ApiProperty } from '@nestjs/swagger';

export class StreetViewCoordinatesDto {
  @ApiProperty({ 
    description: 'Latitude do local onde o panorama foi capturado', 
    example: -23.5505 
  })
  latitude: number;

  @ApiProperty({ 
    description: 'Longitude do local onde o panorama foi capturado', 
    example: -46.6333 
  })
  longitude: number;
}

export class StreetViewResponseDto {
  @ApiProperty({ 
    description: 'Indica se a requisição foi bem-sucedida', 
    example: true 
  })
  success: boolean;

  @ApiProperty({ 
    description: 'Mensagem descritiva do resultado', 
    example: 'Dados do Street View encontrados' 
  })
  message: string;

  @ApiProperty({ 
    description: 'ID do pedido consultado', 
    example: 1 
  })
  orderId: number;

  @ApiProperty({ 
    description: 'Endereço completo utilizado na busca', 
    example: 'Rua das Flores, 123, Centro, São Paulo, SP, 01234-567' 
  })
  address: string;

  @ApiProperty({ 
    description: 'Status retornado pela API do Google (OK, ZERO_RESULTS, NOT_FOUND, etc.)', 
    example: 'OK' 
  })
  status: string;

  @ApiProperty({ 
    description: 'Indica se há cobertura do Street View para este endereço', 
    example: true 
  })
  hasStreetView: boolean;

  @ApiProperty({ 
    description: 'Identificador único do panorama no Google Street View', 
    example: 'CAoSLEFGMVFpcE5fX3...',
    required: false 
  })
  panoId?: string;

  @ApiProperty({ 
    description: 'Coordenadas exatas onde o panorama foi capturado (pode diferir do endereço original)', 
    type: StreetViewCoordinatesDto,
    required: false 
  })
  coordinates?: StreetViewCoordinatesDto;

  @ApiProperty({ 
    description: 'Data de captura da imagem no formato YYYY-MM', 
    example: '2023-05',
    required: false 
  })
  captureDate?: string;

  @ApiProperty({ 
    description: 'URL completa da imagem do Street View', 
    example: 'https://maps.googleapis.com/maps/api/streetview?size=600x400&location=-23.5505,-46.6333&key=...',
    required: false 
  })
  imageUrl?: string;

  @ApiProperty({ 
    description: 'Data/hora em que os dados foram armazenados no cache', 
    example: '2025-12-03T12:00:00.000Z',
    required: false 
  })
  cachedAt?: Date;
}

export class StreetViewBatchRequestDto {
  @ApiProperty({
    description: 'Lista de IDs de pedidos para buscar dados do Street View',
    example: [1, 2, 3],
    type: [Number]
  })
  orderIds: number[];
}
