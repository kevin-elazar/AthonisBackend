/**
 * Fixtures de motorista baseados nos exemplos do OpenAPI (CreateDriverDto, FindDriverDto)
 */
export const createDriverDto = {
  name: 'Pedro Silva',
  document: '12345678900',
  gender: 'M',
  birth_date: '1990-01-15',
};

export const findDriverDto = {
  page: 1,
  limit: 10,
  name: 'Pedro',
  document: '12345678900',
  sort_by: 'name',
  order: 'ASC' as const,
};
