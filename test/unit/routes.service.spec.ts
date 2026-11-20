import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RoutesService } from '@/modules/routes/services/routes.service';
import { Route } from '@/shared/entities/route.entity';
import { Order } from '@/shared/entities/order.entity';
import { Driver } from '@/shared/entities/driver.entity';
import { Vehicle } from '@/shared/entities/vehicle.entity';
import { RouteEvent } from '@/shared/entities/route-event.entity';
import { RouteReturnedStop } from '@/shared/entities/route-returned-stop.entity';
import { Company } from '@/shared/entities/company.entity';
import { RouteStop } from '@/shared/entities/route-stop.entity';
import { TenantContextService } from '@/shared/tenant/tenant-context.service';

/**
 * O que interessa aqui é a propagação de estado: iniciar uma rota tem de
 * mover pedidos, motorista e veículo junto, e concluir tem de devolver os
 * dois últimos. Estado que fica para trás trava a escala do dia seguinte.
 */
describe('RoutesService', () => {
  let service: RoutesService;
  let routeRepository: Repository<Route>;
  let orderRepository: Repository<Order>;

  /** O EntityManager falso: é por ele que as paradas (route_stop) são lidas. */
  let managerAtual: { find: jest.Mock };

  /** Registra o que a transação escreveu, por entidade. */
  let escritas: Array<{ entidade: unknown; criterio: unknown; dados: Record<string, unknown> }>;

  const rotaPlanejada = {
    route_id: 7,
    id_company: 1,
    driver_id: 3,
    vehicle_id: 4,
    status: 'planned',
    simulated: false,
  } as Route;

  const pedido = (order_id: number, status: string) =>
    ({ order_id, id_company: 1, route_id: 7, status, stop_sequence: order_id }) as unknown as Order;

  const montar = async (rota: Partial<Route>, pedidos: Order[]) => {
    escritas = [];

    const manager = {
      update: jest.fn(async (entidade: unknown, criterio: unknown, dados: Record<string, unknown>) => {
        escritas.push({ entidade, criterio, dados });
        return { affected: 1 };
      }),
      insert: jest.fn(async () => ({ identifiers: [] })),
      delete: jest.fn(async (entidade: unknown, criterio: unknown) => {
        escritas.push({ entidade, criterio, dados: { __delete: true } });
        return { affected: 1 };
      }),
      // As paradas da rota vêm de route_stop: uma por pedido da rota.
      find: jest.fn(async (entidade: unknown) => {
        if (entidade === RouteStop) {
          return pedidos
            .filter((item) => item.route_id === 7)
            .map((item) => ({
              id: item.order_id,
              route_id: 7,
              order_id: item.order_id,
              attempt: 1,
              stop_sequence: item.stop_sequence,
              status: ['delivered', 'failed', 'in_route'].includes(item.status) ? item.status : 'planned',
            }));
        }
        if (entidade === Order) return pedidos;
        return [];
      }),
      count: jest.fn(async () => 0),
    };
    managerAtual = manager;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoutesService,
        {
          provide: getRepositoryToken(Route),
          useValue: {
            find: jest.fn().mockResolvedValue([{ ...rotaPlanejada, ...rota }]),
            findOne: jest.fn().mockResolvedValue({ ...rotaPlanejada, ...rota }),
          },
        },
        {
          provide: getRepositoryToken(Order),
          useValue: { find: jest.fn().mockResolvedValue(pedidos) },
        },
        { provide: getRepositoryToken(Driver), useValue: {} },
        { provide: getRepositoryToken(Vehicle), useValue: {} },
        {
          provide: getRepositoryToken(RouteEvent),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(RouteReturnedStop),
          useValue: { find: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
        },
        { provide: getRepositoryToken(Company), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn(async (cb: (m: unknown) => Promise<void>) => cb(manager)),
            manager,
          },
        },
        {
          provide: TenantContextService,
          useValue: {
            getIdCompany: jest.fn().mockReturnValue(1),
            getUser: jest.fn().mockReturnValue({ email: 'admin@athonis.com' }),
          },
        },
      ],
    }).compile();

    service = module.get<RoutesService>(RoutesService);
    routeRepository = module.get(getRepositoryToken(Route));
    orderRepository = module.get(getRepositoryToken(Order));
  };

  const escritaDe = (entidade: unknown) => escritas.filter((e) => e.entidade === entidade);

  describe('start', () => {
    it('move rota, pedidos, motorista e veículo para "em trânsito"', async () => {
      await montar({}, [pedido(1, 'pending'), pedido(2, 'pending')]);

      await service.start(7);

      expect(escritaDe(Route)[0].dados).toMatchObject({ status: 'active' });
      expect(escritaDe(Route)[0].dados.started_at).toBeInstanceOf(Date);
      expect(escritaDe(Order)[0].dados).toMatchObject({ status: 'in_route' });
      expect(escritaDe(Driver)[0].dados).toMatchObject({ status: 'in_route' });
      expect(escritaDe(Vehicle)[0].dados).toMatchObject({ status: 'in_use' });
    });

    it('recusa iniciar uma rota que já está em andamento', async () => {
      await montar({ status: 'active' }, [pedido(1, 'in_route')]);

      await expect(service.start(7)).rejects.toThrow(BadRequestException);
    });

    it('recusa iniciar rota sem pedidos', async () => {
      await montar({}, []);

      await expect(service.start(7)).rejects.toThrow(BadRequestException);
    });
  });

  describe('deliverStop', () => {
    it('baixa a parada sem encerrar a rota quando ainda há entregas', async () => {
      await montar({ status: 'active' }, [pedido(1, 'in_route'), pedido(2, 'in_route')]);

      await service.deliverStop(7, 1);

      expect(escritaDe(Order)[0].dados).toMatchObject({ status: 'delivered' });
      // A rota continua ativa: ninguém foi liberado.
      expect(escritaDe(Route)).toHaveLength(0);
      expect(escritaDe(Driver)).toHaveLength(0);
    });

    it('encerra a rota e libera motorista e veículo na última parada', async () => {
      await montar({ status: 'active' }, [pedido(1, 'delivered'), pedido(2, 'in_route')]);

      await service.deliverStop(7, 2);

      expect(escritaDe(Route)[0].dados).toMatchObject({ status: 'completed' });
      expect(escritaDe(Driver)[0].dados).toMatchObject({ status: 'available' });
      expect(escritaDe(Vehicle)[0].dados).toMatchObject({ status: 'available' });
    });

    it('recusa baixar parada que não pertence à rota', async () => {
      await montar({ status: 'active' }, [pedido(1, 'in_route')]);

      await expect(service.deliverStop(7, 99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('devolve os pedidos para a fila e apaga a rota', async () => {
      await montar({}, [pedido(1, 'planned')]);

      await service.remove(7);

      expect(escritaDe(Order)[0].dados).toMatchObject({
        route_id: null,
        stop_sequence: null,
        status: 'pending',
      });
      expect(escritaDe(Route)[0].dados).toMatchObject({ __delete: true });
    });

    it('recusa apagar rota que já tem entrega concluída', async () => {
      await montar({ status: 'completed' }, [pedido(1, 'delivered')]);

      await expect(service.remove(7)).rejects.toThrow(BadRequestException);
    });

    it('recusa apagar rota em andamento', async () => {
      await montar({ status: 'active' }, [pedido(1, 'in_route')]);

      await expect(service.remove(7)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('devolve as paradas junto com a rota', async () => {
      await montar({}, [pedido(1, 'planned'), pedido(2, 'planned')]);

      const rotas = await service.findAll();

      expect(rotas).toHaveLength(1);
      expect(rotas[0].orders).toHaveLength(2);
      // Uma consulta de paradas para todas as rotas, não uma por rota.
      expect(managerAtual.find.mock.calls.filter(([entidade]) => entidade === RouteStop)).toHaveLength(1);
      expect(routeRepository.find).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * Duplicar toma os pedidos livres da rota cancelada. Entre a consulta e a
   * gravação outro processo pode levá-los; a transação precisa perceber.
   */
  describe('duplicate', () => {
    const montarDuplicacao = (afetados: number[]) => {
      const wheres: string[] = [];
      let chamada = 0;
      const qb: any = {
        update: jest.fn(() => qb),
        set: jest.fn(() => qb),
        where: jest.fn((sql: string) => {
          wheres.push(sql);
          return qb;
        }),
        andWhere: jest.fn((sql: string) => {
          wheres.push(sql);
          return qb;
        }),
        execute: jest.fn(async () => ({ affected: afetados[chamada++] ?? 1 })),
        insert: jest.fn(() => insercao),
      };
      // A criação das paradas da rota nova (route_stop).
      const insercao: any = {
        into: jest.fn(() => insercao),
        values: jest.fn(() => insercao),
        orIgnore: jest.fn(() => insercao),
        execute: jest.fn(async () => ({ identifiers: [] })),
      };
      const manager = {
        find: jest.fn(async () => []),
        count: jest.fn(async () => 0),
        create: jest.fn((_entidade: unknown, dados: object) => dados),
        save: jest.fn(async (dados: object) => ({ ...dados, route_id: 99 })),
        createQueryBuilder: jest.fn(() => qb),
      };
      const devolvidas = [
        { route_id: 7, order_id: 11, stop_sequence: 1 },
        { route_id: 7, order_id: 12, stop_sequence: 2 },
      ];
      const routeRepo = {
        findOne: jest.fn().mockResolvedValue({ ...rotaPlanejada, status: 'cancelled' }),
      };
      const orderRepo = {
        find: jest.fn().mockResolvedValue([{ order_id: 11 }, { order_id: 12 }]),
        count: jest.fn().mockResolvedValue(0),
      };
      const exist = { exist: jest.fn().mockResolvedValue(true) };
      const returnedRepo = {
        count: jest.fn().mockResolvedValue(2),
        find: jest.fn().mockResolvedValue(devolvidas),
      };
      const dataSource = {
        transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb(manager)),
        manager,
      };
      const tenant = {
        getIdCompany: jest.fn().mockReturnValue(1),
        getUser: jest.fn().mockReturnValue({ email: 'admin@athonis.com' }),
      };

      const svc = new RoutesService(
        routeRepo as any,
        orderRepo as any,
        exist as any,
        exist as any,
        {} as any,
        returnedRepo as any,
        { findOne: jest.fn().mockResolvedValue(null) } as any,
        dataSource as any,
        tenant as any,
      );
      jest.spyOn(svc, 'findOne').mockResolvedValue({ route_id: 99 } as any);
      return { svc, wheres, qb, insercao };
    };

    it('toma só pedidos ainda livres na fila', async () => {
      const { svc, wheres, qb, insercao } = montarDuplicacao([1, 1]);

      await expect(svc.duplicate(7)).resolves.toMatchObject({ route_id: 99 });

      expect(qb.execute).toHaveBeenCalledTimes(2);
      expect(wheres).toEqual(expect.arrayContaining(['route_id IS NULL', 'status = :pending']));
      // Uma tentativa nova por pedido levado para a rota duplicada.
      expect(insercao.execute).toHaveBeenCalledTimes(2);
    });

    it('responde 409 e desfaz tudo se outro processo levou um pedido no meio', async () => {
      const { svc } = montarDuplicacao([1, 0]);

      await expect(svc.duplicate(7)).rejects.toThrow(ConflictException);
    });
  });
});
