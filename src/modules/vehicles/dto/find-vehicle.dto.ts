import { IsOptional, IsString, IsNumber, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { VEHICLE_STATUSES, VehicleStatus } from '../../../shared/domain/enums';

export class FindVehicleDto {
  @ApiProperty({ description: 'Número da página', example: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @ApiProperty({ description: 'Itens por página', example: 10, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @ApiProperty({ description: 'Nome do veículo', example: 'Van', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Marca do veículo', example: 'Ford', required: false })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({ description: 'Campo para ordenação', example: 'name', required: false })
  @IsOptional()
  @IsString()
  sort_by?: string;

  @ApiProperty({ description: 'Ordem de classificação', enum: ['ASC', 'DESC'], example: 'ASC', required: false })
  @IsOptional()
  @IsString()
  order?: 'ASC' | 'DESC';

  @ApiProperty({ description: 'Situacao do veiculo', enum: VEHICLE_STATUSES, required: false })
  @IsOptional()
  @IsIn(VEHICLE_STATUSES)
  status?: VehicleStatus;
}
