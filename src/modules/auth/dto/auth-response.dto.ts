import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty({ 
    description: 'Token JWT de autenticação', 
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' 
  })
  access_token: string;

  @ApiProperty({
    description:
      'Token de renovação. Troque por um novo par em POST /auth/refresh antes de o access token expirar.',
  })
  refresh_token: string;

  @ApiProperty({ 
    description: 'Tipo do token', 
    example: 'Bearer' 
  })
  token_type: string;

  @ApiProperty({ 
    description: 'Tempo de expiração em segundos', 
    example: 3600 
  })
  expires_in: number;

  @ApiProperty({ 
    description: 'Dados do usuário autenticado' 
  })
  user: {
    id: number;
    email: string;
    name: string;
    role: string;
    id_company: number;
    driver_id?: number | null;
  };
}

