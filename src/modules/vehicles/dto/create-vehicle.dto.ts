import { IsNotEmpty, IsString, IsOptional, IsNumber, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
  year?: number;
}
