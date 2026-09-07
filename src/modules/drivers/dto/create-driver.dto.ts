import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsDateString,
  IsIn,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DRIVER_STATUSES, DriverStatus } from '../../../shared/domain/enums';

export class CreateDriverDto {
  @ApiProperty({ description: 'Nome completo do motorista', example: 'Pedro Silva' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'Gênero (opcional)', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  gender?: string;

  @ApiProperty({ description: 'Data de nascimento (opcional)', required: false })
  @IsOptional()
  @IsDateString()
  birth_date?: string;

  @ApiProperty({ description: 'CPF (opcional)', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(14)
  document?: string;

  @ApiProperty({ description: 'Telefone de contato', example: '(11) 99999-0000', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ description: 'Número da CNH', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  cnh?: string;

  @ApiProperty({
    description: 'Disponibilidade do motorista',
    enum: DRIVER_STATUSES,
    required: false,
    default: 'available',
  })
  @IsOptional()
  @IsIn(DRIVER_STATUSES, {
    message: 'Status deve ser um de: available, in_route, unavailable',
  })
  status?: DriverStatus;
}
