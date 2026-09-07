import { IsOptional, IsString, IsNumber, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { DRIVER_STATUSES, DriverStatus } from '../../../shared/domain/enums';

export class FindDriverDto {
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

  @ApiProperty({ description: 'Nome do motorista', example: 'Pedro', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Documento (CPF)', example: '123.456.789-00', required: false })
  @IsOptional()
  @IsString()
  document?: string;

  @ApiProperty({ description: 'Campo para ordenação', example: 'name', required: false })
  @IsOptional()
  @IsString()
  sort_by?: string;

  @ApiProperty({ description: 'Ordem de classificação', enum: ['ASC', 'DESC'], example: 'ASC', required: false })
  @IsOptional()
  @IsString()
  order?: 'ASC' | 'DESC';

  @ApiProperty({ description: 'Disponibilidade', enum: DRIVER_STATUSES, required: false })
  @IsOptional()
  @IsIn(DRIVER_STATUSES)
  status?: DriverStatus;
}
