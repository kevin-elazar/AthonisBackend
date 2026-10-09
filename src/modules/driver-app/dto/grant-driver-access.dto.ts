import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class GrantDriverAccessDto {
  @ApiProperty({ description: 'E-mail que o motorista usa para entrar no aplicativo', example: 'pedro@empresa.com' })
  @IsEmail({}, { message: 'Email inválido' })
  @IsNotEmpty({ message: 'Email é obrigatório' })
  email: string;

  @ApiProperty({ description: 'Senha do aplicativo (mínimo 6 caracteres)' })
  @IsString()
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  password: string;
}
