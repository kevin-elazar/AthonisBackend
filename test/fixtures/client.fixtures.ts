/**
 * Fixtures de cliente baseados nos exemplos do OpenAPI (CreateClientDto)
 */
export const createClientDto = {
  name: 'João Silva',
  document: '123.456.789-00',
  type: 'F' as const,
  street: 'Rua das Flores',
  neighborhood: 'Centro',
  city: 'São Paulo',
  state: 'SP',
  zip_code: '01234-567',
  number: '123',
};

export const createClientDtoWithOptional = {
  ...createClientDto,
  trade_name: 'João Silva e Cia',
  email: 'joao@example.com',
  phone: '(11) 99999-9999',
  complement: 'Sala 101',
  notes: 'Cliente preferencial',
};
