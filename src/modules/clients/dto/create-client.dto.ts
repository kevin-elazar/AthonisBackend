import { IsNotEmpty, IsOptional, IsEmail, IsIn, IsDate } from 'class-validator';
import { CLIENT_STATUSES, ClientStatus } from '../../../shared/domain/enums';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateClientDto {
  @ApiProperty({ description: 'Nome completo do cliente', example: 'João Silva' })
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  name!: string;

  @ApiProperty({ description: 'Nome fantasia (opcional)', example: 'João Silva e Cia', required: false })
  @IsOptional()
  trade_name?: string;

  @ApiProperty({ description: 'CPF ou CNPJ', example: '123.456.789-00' })
  @IsNotEmpty({ message: 'Documento é obrigatório' })
  document!: string;

  @ApiProperty({ description: 'Inscrição estadual (opcional)', required: false })
  @IsOptional()
  state_registration?: string;

  @ApiProperty({ description: 'Email', example: 'joao@example.com', required: false })
  @IsOptional()
  @IsEmail({}, { message: 'Formato de email inválido' })
  email?: string;

  @ApiProperty({ description: 'Telefone', example: '(11) 99999-9999', required: false })
  @IsOptional()
  phone?: string;

  @ApiProperty({ description: 'Tipo de cliente', enum: ['F', 'J'], example: 'F' })
  @IsNotEmpty({ message: 'Tipo é obrigatório' })
  @IsIn(['F', 'J'], { message: 'Tipo deve ser F ou J' })
  type!: string;

  /*@IsOptional()
  @Type(() => Date)
  @IsDate()
  birth_date?: Date;
*/
  @ApiProperty({ description: 'Rua do endereço', example: 'Rua das Flores' })
  @IsNotEmpty({ message: 'Rua é obrigatória' })
  street!: string;

  @ApiProperty({ description: 'Bairro', example: 'Centro' })
  @IsNotEmpty({ message: 'Bairro é obrigatório' })
  neighborhood!: string;

  @ApiProperty({ description: 'Cidade', example: 'São Paulo' })
  @IsNotEmpty({ message: 'Cidade é obrigatória' })
  city!: string;

  @ApiProperty({ description: 'Estado', example: 'SP' })
  @IsNotEmpty({ message: 'Estado é obrigatório' })
  state!: string;

  @ApiProperty({ description: 'CEP', example: '01234-567' })
  @IsNotEmpty({ message: 'CEP é obrigatório' })
  zip_code!: string;

  @ApiProperty({ description: 'Número do endereço', example: '123' })
  @IsNotEmpty({ message: 'Número é obrigatório' })
  number!: string;

  @ApiProperty({ description: 'Complemento (opcional)', required: false })
  @IsOptional()
  complement?: string;

  @ApiProperty({ description: 'Observações/Anotações (opcional)', required: false })
  @IsOptional()
  notes?: string;

  @ApiProperty({
    description: 'Situação do cliente',
    enum: CLIENT_STATUSES,
    required: false,
    default: 'active',
  })
  @IsOptional()
  @IsIn(CLIENT_STATUSES, { message: 'Status deve ser um de: active, inactive' })
  status?: ClientStatus;
}
