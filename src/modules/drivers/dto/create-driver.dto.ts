import { IsNotEmpty, IsString, IsOptional, IsDate, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
  @IsDate()
  birth_date?: Date;

  @ApiProperty({ description: 'CPF (opcional)', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(14)
  document?: string;
}
