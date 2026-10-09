import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ 
    description: 'Email do usuário', 
    example: 'admin@athonis.com' 
  })
  @IsEmail({}, { message: 'Email inválido' })
  @IsNotEmpty({ message: 'Email é obrigatório' })
  email: string;

  @ApiProperty({ 
    description: 'Senha do usuário', 
    example: 'admin123'
  })
  @IsString()
  @IsNotEmpty({ message: 'Senha é obrigatória' })
  password: string;

  @ApiProperty({
    description: 'Identificação do aparelho, para o escritório reconhecer a sessão',
    example: 'Samsung A54',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  device?: string;
}

