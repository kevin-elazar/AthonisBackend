import { ApiProperty } from '@nestjs/swagger';

export class RouteStop {
  @ApiProperty({ description: 'ID do pedido', example: 1 })
  orderId: number;

  @ApiProperty({ description: 'Nome do cliente', example: 'João Silva' })
  clientName: string;

  @ApiProperty({ description: 'Endereço completo', example: 'Rua das Flores, 123, Centro, São Paulo, SP' })
  address: string;

  @ApiProperty({ description: 'Coordenadas geográficas', example: { latitude: -23.5505, longitude: -46.6333 } })
  coordinates: {
    latitude: number;
    longitude: number;
  };

  @ApiProperty({ description: 'Horário estimado de chegada', example: '2024-01-17T10:30:00.000Z' })
  estimatedArrivalTime: string;

  @ApiProperty({ description: 'Duração estimada em minutos', example: 30 })
  estimatedDuration: number;
}

export class OptimizedRoute {
  @ApiProperty({ description: 'ID do veículo', example: 1 })
  vehicleId: number;

  @ApiProperty({ description: 'Nome do veículo', example: 'Van de Entregas 001' })
  vehicleName: string;

  @ApiProperty({ description: 'ID do motorista', example: 1 })
  driverId: number;

  @ApiProperty({ description: 'Nome do motorista', example: 'Pedro Henrique Santos' })
  driverName: string;

  @ApiProperty({ description: 'Distância total em metros', example: 15000 })
  totalDistance: number;

  @ApiProperty({ description: 'Duração total em minutos', example: 60 })
  totalDuration: number;

  @ApiProperty({ description: 'Paradas da rota', type: [RouteStop] })
  stops: RouteStop[];

  @ApiProperty({ description: 'Localização de início', example: { latitude: -23.5505, longitude: -46.6333 } })
  startLocation: {
    latitude: number;
    longitude: number;
  };

  @ApiProperty({ description: 'Localização de término', example: { latitude: -23.5505, longitude: -46.6333 } })
  endLocation: {
    latitude: number;
    longitude: number;
  };
}

export class OptimizationResultDto {
  @ApiProperty({ description: 'Indica se a otimização foi bem-sucedida', example: true })
  success: boolean;

  @ApiProperty({ description: 'Mensagem de resultado', example: 'Rotas otimizadas com sucesso' })
  message: string;

  @ApiProperty({ description: 'Total de rotas criadas', example: 3 })
  totalRoutes: number;

  @ApiProperty({ description: 'Total de pedidos processados', example: 5 })
  totalOrders: number;

  @ApiProperty({ description: 'Tempo de otimização em milissegundos', example: 150 })
  optimizationTime: number;

  @ApiProperty({ description: 'Rotas otimizadas', type: [OptimizedRoute] })
  routes: OptimizedRoute[];

  @ApiProperty({ description: 'IDs dos pedidos não atribuídos (opcional)', example: [], required: false })
  unassignedOrders?: number[];
}
