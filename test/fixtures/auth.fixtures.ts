/**
 * Fixtures de autenticação baseados nos exemplos do OpenAPI (LoginDto, RegisterDto)
 */
export const loginDto = {
  email: 'admin@athonis.com',
  password: 'admin123',
};

export const registerDto = {
  email: 'usuario@exemplo.com',
  password: 'senha123',
  name: 'João Silva',
  role: 'user',
};

export const invalidLoginDto = {
  email: 'invalido@teste.com',
  password: 'senhaerrada',
};
