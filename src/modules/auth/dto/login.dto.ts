import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ 
    description: 'Email do usuário', 
    example: 'usuario@exemplo.com' 
  })
  @IsEmail({}, { message: 'Email inválido' })
  @IsNotEmpty({ message: 'Email é obrigatório' })
  email: string;

  @ApiProperty({ 
    description: 'Senha do usuário', 
    example: 'senha123' 
  })
  @IsString()
  @IsNotEmpty({ message: 'Senha é obrigatória' })
  password: string;
}

