import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

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
    description: 'Função do usuário', 
    example: 'user',
    required: false,
    default: 'user'
  })
  @IsString()
  @IsOptional()
  role?: string;
}

