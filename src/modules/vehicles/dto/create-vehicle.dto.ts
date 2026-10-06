import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsIn,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  VEHICLE_STATUSES,
  VEHICLE_TYPES,
  VehicleStatus,
  VehicleType,
} from '../../../shared/domain/enums';

export class CreateVehicleDto {
  @ApiProperty({ description: 'Nome do veículo', example: 'Van de Entregas 001' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'Marca do veículo (opcional)', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  brand?: string;

  @ApiProperty({ description: 'Modelo do veículo (opcional)', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  model?: string;

  @ApiProperty({ description: 'Ano do veículo (opcional)', required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  year?: number;

  @ApiProperty({ description: 'Placa do veículo', example: 'ABC1D23', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  plate?: string;

  @ApiProperty({
    description: 'Tipo do veículo',
    enum: VEHICLE_TYPES,
    required: false,
    default: 'van',
  })
  @IsOptional()
  @IsIn(VEHICLE_TYPES, { message: 'Tipo deve ser um de: van, truck, motorcycle, utility' })
  type?: VehicleType;

  @ApiProperty({ description: 'Capacidade de carga em quilos', example: 1200, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  capacity_kg?: number;

  @ApiProperty({
    description: 'Situação do veículo',
    enum: VEHICLE_STATUSES,
    required: false,
    default: 'available',
  })
  @IsOptional()
  @IsIn(VEHICLE_STATUSES, {
    message: 'Status deve ser um de: available, in_use, maintenance, inactive',
  })
  status?: VehicleStatus;

  @ApiProperty({ description: 'Motorista habitual do veículo', required: false })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  driver_id?: number;
}
