import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { OFFICE_ROLES, OfficeRole } from '../../../shared/domain/enums';

export class RegisterDto {
  @ApiProperty({ 
    description: 'Email do usuário', 
    example: 'usuario@exemplo.com' 
  })
  @IsEmail({}, { message: 'Email inválido' })
  @IsNotEmpty({ message: 'Email é obrigatório' })
  email: string;

  @ApiProperty({ 
    description: 'Senha do usuário (mínimo 6 caracteres)', 
    example: 'senha123' 
  })
  @IsString()
  @IsNotEmpty({ message: 'Senha é obrigatória' })
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  password: string;

  @ApiProperty({ 
    description: 'Nome completo do usuário', 
    example: 'João Silva' 
  })
  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  name: string;

  @ApiProperty({
    description: 'Funcao do usuario',
    enum: OFFICE_ROLES,
    example: 'user',
    required: false,
    default: 'user',
  })
  @IsOptional()
  @IsIn(OFFICE_ROLES, { message: 'Funcao deve ser uma de: admin, user' })
  role?: OfficeRole;
}

