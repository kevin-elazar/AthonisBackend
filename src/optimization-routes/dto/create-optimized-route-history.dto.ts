import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateOptimizedRouteHistoryDto {
  @ApiProperty({ 
    description: 'IDs dos pedidos incluídos na otimização', 
    example: [1, 2, 3, 4, 5] 
  })
  @IsArray()
  @IsNotEmpty()
  order_ids: number[];

  @ApiProperty({ 
    description: 'Total de rotas criadas', 
    example: 2 
  })
  @IsNumber()
  @IsNotEmpty()
  total_routes: number;

  @ApiProperty({ 
    description: 'Total de pedidos processados', 
    example: 5 
  })
  @IsNumber()
  @IsNotEmpty()
  total_orders: number;

  @ApiProperty({ 
    description: 'Tempo de otimização em milissegundos', 
    example: 1500,
    required: false 
  })
  @IsNumber()
  @IsOptional()
  optimization_time_ms?: number;

  @ApiProperty({ 
    description: 'Resposta completa da API do Google Maps (JSON)', 
    example: '{"routes": [...]}' 
  })
  @IsString()
  @IsNotEmpty()
  google_api_response: string;

  @ApiProperty({ 
    description: 'Resultado formatado da otimização (JSON)', 
    example: '{"success": true, "routes": [...]}' 
  })
  @IsString()
  @IsNotEmpty()
  optimization_result: string;

  @ApiProperty({ 
    description: 'Status da otimização', 
    example: 'success',
    required: false 
  })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiProperty({ 
    description: 'Observações adicionais', 
    example: 'Otimização realizada com sucesso',
    required: false 
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ 
    description: 'Usuário que criou o registro', 
    example: 'admin',
    required: false 
  })
  @IsString()
  @IsOptional()
  created_by?: string;
}

