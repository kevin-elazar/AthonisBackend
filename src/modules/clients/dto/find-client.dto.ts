import { IsOptional, IsEmail, IsIn, IsDate } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class FindClientDto {
  @ApiProperty({ description: 'Número da página', example: 1, required: false })
  @IsOptional()
  page?: number;

  @ApiProperty({ description: 'Itens por página', example: 10, required: false })
  @IsOptional()
  limit?: number;

  @ApiProperty({ description: 'Nome do cliente', example: 'João', required: false })
  @IsOptional()
  name?: string;

  @ApiProperty({ description: 'Nome fantasia', example: 'Cia', required: false })
  @IsOptional()
  tradingName?: string;

  @ApiProperty({ description: 'Documento (CPF/CNPJ)', example: '123.456.789-00', required: false })
  @IsOptional()
  document?: string;

  @ApiProperty({ description: 'Email', example: 'joao@example.com', required: false })
  @IsOptional()
  @IsEmail({}, { message: 'Formato de email inválido' })
  email?: string;

  @ApiProperty({ description: 'Telefone', example: '(11) 99999-9999', required: false })
  @IsOptional()
  phone?: string;

  @ApiProperty({ description: 'Tipo de cliente', enum: ['F', 'J'], example: 'F', required: false })
  @IsOptional()
  @IsIn(['F', 'J'], { message: 'Tipo deve ser F ou J' })
  type?: string;

  @ApiProperty({ description: 'Data de nascimento', example: '1990-01-01', required: false })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  birthDate?: Date;

  @ApiProperty({ description: 'Campo para ordenação', example: 'name', required: false })
  @IsOptional()
  sort_by?: string;

  @ApiProperty({ description: 'Ordem de classificação', enum: ['ASC', 'DESC'], example: 'ASC', required: false })
  @IsOptional()
  @IsIn(['ASC', 'DESC'], { message: 'Ordem deve ser ASC ou DESC' })
  order?: 'ASC' | 'DESC';
}
