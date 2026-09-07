/**
 * Fixtures de pedido baseados nos exemplos do OpenAPI (CreateOrderDto)
 */
export const createOrderDto = {
  client_id: 1,
  title: 'Entrega de mercadorias',
  urgency: 'normal' as const,
  quantity: 10,
  delivery_street: 'Rua das Flores',
  delivery_district: 'Centro',
  delivery_city: 'São Paulo',
  delivery_state: 'SP',
  delivery_zipcode: '01234-567',
  delivery_number: '123',
};

export const createOrderDtoWithOptional = {
  ...createOrderDto,
  description: 'Entrega de equipamentos de informática',
  invoice_number: 'NF-2024-001',
  vehicle_id: 1,
  driver_id: 1,
  delivery_complement: 'Sala 101',
};
