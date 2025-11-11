import { ApiProperty } from '@nestjs/swagger';

export class OptimizedRouteHistoryResponseDto {
  @ApiProperty({ description: 'ID do registro', example: 1 })
  id: number;

  @ApiProperty({ description: 'Data de criação', example: '2024-01-17T10:30:00.000Z' })
  created_at: Date;

  @ApiProperty({ description: 'Data de última atualização', example: '2024-01-17T10:30:00.000Z' })
  updated_at: Date;

  @ApiProperty({ description: 'IDs dos pedidos', example: [1, 2, 3, 4, 5] })
  order_ids: number[];

  @ApiProperty({ description: 'Total de rotas criadas', example: 2 })
  total_routes: number;

  @ApiProperty({ description: 'Total de pedidos processados', example: 5 })
  total_orders: number;

  @ApiProperty({ description: 'Tempo de otimização em milissegundos', example: 1500 })
  optimization_time_ms: number;

  @ApiProperty({ description: 'Resposta da API do Google Maps (objeto JSON)' })
  google_api_response: any;

  @ApiProperty({ description: 'Resultado formatado da otimização (objeto JSON)' })
  optimization_result: any;

  @ApiProperty({ description: 'Status da otimização', example: 'success' })
  status: string;

  @ApiProperty({ description: 'Observações', example: 'Otimização bem-sucedida' })
  notes: string;

  @ApiProperty({ description: 'Criado por', example: 'admin' })
  created_by: string;
}

