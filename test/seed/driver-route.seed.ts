import { DataSource } from 'typeorm';
import { Driver } from '../../src/shared/entities/driver.entity';
import { Route } from '../../src/shared/entities/route.entity';
import { Order } from '../../src/shared/entities/order.entity';
import { todayInTimeZone } from '../../src/shared/domain/timezone';

export const TEST_COMPANY = 1000;

export async function seedDriver(dataSource: DataSource, name: string): Promise<Driver> {
  const repository = dataSource.getRepository(Driver);
  return repository.save(
    repository.create({ id_company: TEST_COMPANY, name, status: 'available' }),
  );
}

/** Uma rota planejada para hoje, com `stops` paradas em sequência. */
export async function seedRoute(
  dataSource: DataSource,
  driverId: number,
  stops = 3,
  extra: Partial<Route> = {},
): Promise<{ route: Route; orders: Order[] }> {
  const routeRepository = dataSource.getRepository(Route);
  const orderRepository = dataSource.getRepository(Order);

  const route = await routeRepository.save(
    routeRepository.create({
      id_company: TEST_COMPANY,
      driver_id: driverId,
      status: 'planned',
      planned_date: todayInTimeZone('America/Sao_Paulo') as unknown as Date,
      total_distance_m: 12000,
      total_duration_min: 60,
      simulated: false,
      region: 'Jaraguá do Sul',
      ...extra,
    }),
  );

  const orders: Order[] = [];
  for (let index = 0; index < stops; index += 1) {
    orders.push(
      await orderRepository.save(
        orderRepository.create({
          id_company: TEST_COMPANY,
          title: `Entrega ${index + 1}`,
          urgency: 'normal',
          status: 'planned',
          quantity: 1,
          route_id: route.route_id,
          driver_id: driverId,
          stop_sequence: index + 1,
          delivery_street: 'Rua das Flores',
          delivery_number: String(100 + index),
          delivery_district: 'Centro',
          delivery_city: 'Jaraguá do Sul',
          delivery_state: 'SC',
          delivery_zipcode: '89251-000',
          delivery_latitude: -26.4853 + index * 0.01,
          delivery_longitude: -49.0661,
        }),
      ),
    );
  }

  return { route, orders };
}
