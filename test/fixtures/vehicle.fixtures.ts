/**
 * Fixtures de veículo baseados nos exemplos do OpenAPI (CreateVehicleDto, FindVehicleDto)
 */
export const createVehicleDto = {
  name: 'Van de Entregas 001',
  brand: 'Ford',
  model: 'Transit',
  year: 2022,
};

export const findVehicleDto = {
  page: 1,
  limit: 10,
  name: 'Van',
  brand: 'Ford',
  sort_by: 'name',
  order: 'ASC' as const,
};
