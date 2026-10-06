import {
  IsOptional,
  IsString,
  IsEmail,
  IsBoolean,
  IsInt,
  IsNumber,
  IsLatitude,
  IsLongitude,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Campos editáveis da empresa.
 *
 * `id_company` não está aqui de propósito: trocar o tenant de um registro
 * pela API permitiria mover dados entre empresas.
 */
export class UpdateCompanyDto {
  @ApiProperty({ description: 'Razão social', example: 'Athonis Logística Ltda', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  corporate_name?: string;

  @ApiProperty({ description: 'Nome fantasia', example: 'Athonis', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  trade_name?: string;

  @ApiProperty({ description: 'CNPJ', example: '12345678000199', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(18)
  document?: string;

  @ApiProperty({ description: 'Inscrição estadual', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  state_registration?: string;

  @ApiProperty({ description: 'Inscrição municipal', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  municipal_registration?: string;

  @ApiProperty({ description: 'Email de contato', required: false })
  @IsOptional()
  @IsEmail({}, { message: 'Formato de email inválido' })
  @MaxLength(100)
  email?: string;

  @ApiProperty({ description: 'Telefone de contato', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ description: 'Site da empresa', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  website?: string;

  // ------------------------------------------------------------- Depósito

  @ApiProperty({ description: 'Rua do depósito', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  depot_street?: string;

  @ApiProperty({ description: 'Número do depósito', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  depot_number?: string;

  @ApiProperty({ description: 'Complemento do depósito', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  depot_complement?: string;

  @ApiProperty({ description: 'Bairro do depósito', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  depot_district?: string;

  @ApiProperty({ description: 'Cidade do depósito', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  depot_city?: string;

  @ApiProperty({ description: 'UF do depósito', example: 'SP', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  depot_state?: string;

  @ApiProperty({ description: 'CEP do depósito', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  depot_zip_code?: string;

  @ApiProperty({
    description: 'Latitude do depósito — ponto de partida das rotas',
    example: -23.5505,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude({ message: 'Latitude inválida' })
  depot_latitude?: number;

  @ApiProperty({
    description: 'Longitude do depósito — ponto de partida das rotas',
    example: -46.6333,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude({ message: 'Longitude inválida' })
  depot_longitude?: number;

  // ------------------------------------------------ Parâmetros operacionais

  @ApiProperty({ description: 'Custo por quilômetro', example: 1.5, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cost_per_km?: number;

  @ApiProperty({ description: 'Custo por hora', example: 60, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cost_per_hour?: number;

  @ApiProperty({ description: 'Tempo médio por parada, em minutos', example: 30, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stop_duration_minutes?: number;

  @ApiProperty({
    description: 'Capacidade assumida quando o veículo não tem capacidade cadastrada (kg)',
    example: 1000,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  default_vehicle_capacity_kg?: number;

  @ApiProperty({ description: 'Início da operação (HH:mm)', example: '08:00', required: false })
  @IsOptional()
  @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, { message: 'Use o formato HH:mm' })
  operation_start_time?: string;

  @ApiProperty({ description: 'Fim da operação (HH:mm)', example: '18:00', required: false })
  @IsOptional()
  @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, { message: 'Use o formato HH:mm' })
  operation_end_time?: string;

  // -------------------------------------------------------------- Interface

  @ApiProperty({ description: 'URL do logotipo', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  logo_url?: string;

  @ApiProperty({ description: 'Fuso horário', example: 'America/Sao_Paulo', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  timezone?: string;

  @ApiProperty({ description: 'Empresa ativa', required: false })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
