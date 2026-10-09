import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token recebido no login ou na última renovação' })
  @IsString()
  @IsNotEmpty({ message: 'Refresh token é obrigatório' })
  @MaxLength(200)
  refresh_token: string;
}
