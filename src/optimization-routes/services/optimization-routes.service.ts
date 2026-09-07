import { Injectable, HttpException, HttpStatus, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Order } from '../../shared/entities/order.entity';
import { Client } from '../../shared/entities/client.entity';
import { Driver } from '../../shared/entities/driver.entity';
import { Vehicle } from '../../shared/entities/vehicle.entity';
import {
  OptimizationResultDto,
  OptimizedRoute,
  RouteStop,
  UnassignedOrderDto,
  OptimizationMode,
} from '../dto/optimization-result.dto';
import { GeocodingService, GeocodingResult } from './geocoding.service';
import { OptimizedRoutesHistoryService } from './optimized-routes-history.service';
import { GoogleMapsRouteOptimization } from '../server';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';
import { config } from '../../config/env.config';
import { CompanyService, RoutingSettings } from '../../modules/company/services/company.service';

type RoutableStop = { order: any; coordinates: GeocodingResult };

@Injectable()
export class OptimizationRoutesService {
  private readonly logger = new Logger(OptimizationRoutesService.name);

  private googleMapsClient: GoogleMapsRouteOptimization;

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
    @InjectRepository(Driver)
    private driverRepository: Repository<Driver>,
    @InjectRepository(Vehicle)
    private vehicleRepository: Repository<Vehicle>,
    private geocodingService: GeocodingService,
    @Inject(forwardRef(() => OptimizedRoutesHistoryService))
    private historyService: OptimizedRoutesHistoryService,
    private tenantContext: TenantContextService,
    private companyService: CompanyService,
  ) {
    const projectId = config.google.projectId;
    if (projectId) {
      this.googleMapsClient = new GoogleMapsRouteOptimization(projectId);
    }
  }

  /**
   * Classifica os pedidos em roteirizáveis e não roteirizáveis, sempre com um
   * motivo explícito para cada exclusão.
   */
  async validateOrders(orderIds: number[]): Promise<{
    validOrders: number[];
    invalidOrders: number[];
    unassigned: UnassignedOrderDto[];
  }> {
    try {
      const idCompany = this.tenantContext.getIdCompany();

      const orders = await this.orderRepository.find({
        where: { order_id: In(orderIds), id_company: idCompany },
        relations: ['client', 'driver', 'vehicle'],
      });

      const foundOrderIds = new Set(orders.map((order) => order.order_id));
      const invalidOrders = orderIds.filter((id) => !foundOrderIds.has(id));

      const unassigned: UnassignedOrderDto[] = invalidOrders.map((orderId) => ({
        orderId,
        reason: 'Pedido não encontrado ou pertence a outra empresa',
      }));

      const validOrders: number[] = [];

      for (const order of orders) {
        const reason = this.getIneligibilityReason(order);
        if (reason) {
          unassigned.push({ orderId: order.order_id, reason });
        } else {
          validOrders.push(order.order_id);
        }
      }

      return { validOrders, invalidOrders, unassigned };
    } catch (error) {
      this.logger.error('Erro na validação de pedidos:', error);
      throw new HttpException('Erro ao validar pedidos', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async optimizeRoutes(orderIds: number[]): Promise<OptimizationResultDto> {
    const startTime = Date.now();
    let googleApiResponse: any = null;

    try {
      this.logger.log(`Iniciando otimização para ${orderIds.length} pedidos`);

      const validation = await this.validateOrders(orderIds);
      const unassignedOrders: UnassignedOrderDto[] = [...validation.unassigned];

      if (validation.validOrders.length === 0) {
        throw new HttpException(
          {
            success: false,
            message: 'Nenhum pedido válido encontrado para otimização',
            unassignedOrders,
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Depósito, custos e tempo de parada vêm do cadastro da empresa.
      const settings = await this.companyService.getRoutingSettings();

      if (settings.usingFallbackDepot) {
        this.logger.warn(
          'Empresa sem depósito cadastrado: as rotas partem do ponto padrão em São Paulo.',
        );
      }

      const orders = await this.getOrdersWithDetails(validation.validOrders);
      const groupedOrders = this.groupOrdersByVehicleAndDriver(orders);

      const { routes, apiResponses } = await this.buildRoutesForGroups(
        groupedOrders,
        unassignedOrders,
        settings,
      );
      googleApiResponse = apiResponses;

      const routedOrderIds = routes.flatMap((route) => route.stops.map((stop) => stop.orderId));
      const simulated = routes.some((route) => route.mode === 'simulated');
      const mode: OptimizationMode = simulated ? 'simulated' : 'google';
      const optimizationTime = Date.now() - startTime;

      const result: OptimizationResultDto = {
        success: routes.length > 0,
        message: this.buildResultMessage(
          routes.length,
          unassignedOrders.length,
          simulated,
          settings.usingFallbackDepot,
        ),
        usingFallbackDepot: settings.usingFallbackDepot,
        totalRoutes: routes.length,
        totalOrders: routedOrderIds.length,
        optimizationTime,
        routes,
        unassignedOrders,
        mode,
        simulated,
      };

      try {
        await this.historyService.create({
          order_ids: routedOrderIds,
          total_routes: routes.length,
          total_orders: routedOrderIds.length,
          optimization_time_ms: optimizationTime,
          google_api_response: JSON.stringify(googleApiResponse || {}),
          optimization_result: JSON.stringify(result),
          // Uma execução que não gerou rota alguma é falha, não sucesso; e uma
          // rota simulada nunca é registrada como sucesso pleno — quem consultar
          // o histórico precisa distinguir dado real de estimativa.
          status: routes.length === 0 ? 'failed' : simulated ? 'simulated' : 'success',
          notes: simulated
            ? `Resultado SIMULADO (sem Google Route Optimization) com ${routes.length} rota(s).`
            : `Otimização realizada com ${routes.length} rota(s) criada(s).`,
        });
      } catch (historyError) {
        this.logger.error('Erro ao salvar histórico de otimização:', historyError);
      }

      return result;
    } catch (error) {
      this.logger.error('Erro na otimização de rotas:', error);

      try {
        await this.historyService.create({
          order_ids: orderIds,
          total_routes: 0,
          total_orders: orderIds.length,
          optimization_time_ms: Date.now() - startTime,
          google_api_response: JSON.stringify(googleApiResponse || {}),
          optimization_result: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          }),
          status: 'failed',
          notes: `Falha na otimização: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        });
      } catch (historyError) {
        this.logger.error('Erro ao salvar histórico de falha:', historyError);
      }

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Erro interno durante a otimização de rotas',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private buildResultMessage(
    routeCount: number,
    unassignedCount: number,
    simulated: boolean,
    usingFallbackDepot = false,
  ): string {
    const parts: string[] = [];

    if (routeCount === 0) {
      parts.push('Nenhuma rota pôde ser gerada');
    } else if (simulated) {
      parts.push(
        `${routeCount} rota(s) gerada(s) em modo SIMULADO — distâncias e tempos são estimativas e não devem ser usados para despacho`,
      );
    } else {
      parts.push(`${routeCount} rota(s) otimizada(s) com sucesso`);
    }

    if (unassignedCount > 0) {
      parts.push(`${unassignedCount} pedido(s) ficaram de fora (veja unassignedOrders)`);
    }

    if (usingFallbackDepot && routeCount > 0) {
      parts.push(
        'Atenção: a empresa não tem depósito cadastrado, então as rotas partem de um ponto padrão em São Paulo',
      );
    }

    return `${parts.join('. ')}.`;
  }

  /**
   * Motivo pelo qual um pedido não pode entrar na roteirização, ou null se puder.
   *
   * Cliente não entra na lista: a rota é feita a partir do endereço, e uma
   * entrega avulsa (sem cliente cadastrado) é perfeitamente roteirizável.
   */
  private getIneligibilityReason(order: Order): string | null {
    if (!order.delivery_street || !order.delivery_city || !order.delivery_state) {
      return 'Endereço de entrega incompleto (rua, cidade e estado são obrigatórios)';
    }
    if (!order.vehicle_id && !order.driver_id) {
      return 'Pedido sem veículo e sem motorista atribuídos';
    }
    if (!order.vehicle_id) {
      return 'Pedido sem veículo atribuído';
    }
    if (!order.driver_id) {
      return 'Pedido sem motorista atribuído';
    }
    return null;
  }

  private async getOrdersWithDetails(orderIds: number[]): Promise<any[]> {
    const idCompany = this.tenantContext.getIdCompany();
    return await this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.client', 'client')
      .leftJoinAndSelect('order.driver', 'driver')
      .leftJoinAndSelect('order.vehicle', 'vehicle')
      .where('order.order_id IN (:...ids)', { ids: orderIds })
      .andWhere('order.id_company = :idCompany', { idCompany })
      .getMany();
  }

  private groupOrdersByVehicleAndDriver(orders: any[]): Map<string, any[]> {
    const grouped = new Map<string, any[]>();

    orders.forEach((order) => {
      const key = `${order.vehicle_id}-${order.driver_id}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(order);
    });

    return grouped;
  }

  private async buildRoutesForGroups(
    groupedOrders: Map<string, any[]>,
    unassignedOrders: UnassignedOrderDto[],
    settings: RoutingSettings,
  ): Promise<{ routes: OptimizedRoute[]; apiResponses: any[] }> {
    const routes: OptimizedRoute[] = [];
    const apiResponses: any[] = [];

    for (const [key, orders] of groupedOrders) {
      try {
        const { route, apiResponse } = await this.buildRouteForGroup(
          orders,
          unassignedOrders,
          settings,
        );
        if (route) {
          routes.push(route);
          if (apiResponse) {
            apiResponses.push(apiResponse);
          }
        }
      } catch (error) {
        this.logger.error(`Erro ao criar rota para grupo ${key}:`, error);
        // Um grupo que falha não pode sumir em silêncio: cada pedido dele
        // volta para o cliente com o motivo.
        const reason =
          error instanceof Error
            ? `Falha ao gerar a rota deste grupo: ${error.message}`
            : 'Falha ao gerar a rota deste grupo';
        orders.forEach((order) => unassignedOrders.push({ orderId: order.order_id, reason }));
      }
    }

    return { routes, apiResponses };
  }

  private async buildRouteForGroup(
    orders: any[],
    unassignedOrders: UnassignedOrderDto[],
    settings: RoutingSettings,
  ): Promise<{ route: OptimizedRoute | null; apiResponse: any | null }> {
    const addresses = orders.map((order) => this.formatAddress(order));
    const geocodingAvailable = this.geocodingService.isConfigured();

    // O array de coordenadas mantém a MESMA posição do array de pedidos: um
    // endereço que falha vem como null e o pedido correspondente sai da rota,
    // em vez de herdar a coordenada do pedido seguinte.
    let coordinates: (GeocodingResult | null)[];

    if (geocodingAvailable) {
      coordinates = await this.geocodingService.geocodeMultipleAddresses(addresses);
    } else {
      this.logger.warn('Geocoding não configurado: usando coordenadas simuladas.');
      coordinates = orders.map((order, index) =>
        this.geocodingService.getSimulatedCoordinates(order.delivery_city, addresses[index]),
      );
    }

    const routable: RoutableStop[] = [];

    orders.forEach((order, index) => {
      const coordinate = coordinates[index];
      if (coordinate) {
        routable.push({ order, coordinates: coordinate });
      } else {
        unassignedOrders.push({
          orderId: order.order_id,
          reason: `Endereço não localizado no geocoding: ${addresses[index]}`,
        });
      }
    });

    if (routable.length === 0) {
      return { route: null, apiResponse: null };
    }

    // Sem geocoding real não existe rota real: o resultado é sempre simulado.
    if (this.googleMapsClient && geocodingAvailable) {
      try {
        const apiResponse = await this.googleMapsClient.optimizeTours(
          this.buildOptimizationModel(routable, settings),
        );
        return {
          route: this.processGoogleMapsResponse(apiResponse, routable, settings),
          apiResponse,
        };
      } catch (error) {
        this.logger.warn(
          'Falha na API do Google Maps, caindo para rota simulada:',
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    return { route: this.createSimulatedRoute(routable, settings), apiResponse: null };
  }

  private buildOptimizationModel(routable: RoutableStop[], settings: RoutingSettings) {
    // Capacidade real do veículo quando cadastrada; senão, o padrão da empresa.
    const vehicleCapacity =
      Number(routable[0]?.order?.vehicle?.capacity_kg) || settings.defaultVehicleCapacityKg;

    return {
      vehicles: [
        {
          startLocation: settings.depot,
          endLocation: settings.depot,
          costPerKilometer: settings.costPerKm,
          costPerHour: settings.costPerHour,
          loadLimits: {
            weight: { maxLoad: vehicleCapacity },
          },
        },
      ],
      shipments: routable.map((stop) => ({
        pickups: [
          {
            arrivalLocation: settings.depot,
            duration: { seconds: 0 },
          },
        ],
        deliveries: [
          {
            arrivalLocation: {
              latitude: stop.coordinates.latitude,
              longitude: stop.coordinates.longitude,
            },
            duration: { seconds: settings.stopDurationMinutes * 60 },
          },
        ],
        loadDemands: {
          weight: { amount: stop.order.quantity || 1 },
        },
      })),
    };
  }

  private processGoogleMapsResponse(
    response: any,
    routable: RoutableStop[],
    settings: RoutingSettings,
  ): OptimizedRoute {
    const optimizationResult = response[0];

    if (
      !optimizationResult ||
      !optimizationResult.routes ||
      optimizationResult.routes.length === 0
    ) {
      throw new Error('Nenhuma rota retornada pela API do Google Maps');
    }

    const route = optimizationResult.routes[0];
    const deliveryVisits = route.visits?.filter((visit: any) => !visit.isPickup) || [];

    const stops: RouteStop[] = deliveryVisits
      .map((visit: any, index: number) => {
        // shipmentIndex referencia a lista enviada, que é exatamente `routable`.
        const entry = routable[visit.shipmentIndex];
        if (!entry) {
          this.logger.warn(`Visita com shipmentIndex fora do intervalo: ${visit.shipmentIndex}`);
          return null;
        }

        let estimatedArrivalTime = this.calculateEstimatedTime(
          index,
          settings.stopDurationMinutes,
        );
        if (visit.startTime && visit.startTime.seconds) {
          const startDate = new Date();
          startDate.setSeconds(startDate.getSeconds() + parseInt(visit.startTime.seconds));
          estimatedArrivalTime = startDate.toISOString();
        }

        return {
          orderId: entry.order.order_id,
          clientName: entry.order.client?.name || entry.order.title || 'Entrega avulsa',
          address: this.formatAddress(entry.order),
          coordinates: {
            latitude: entry.coordinates.latitude,
            longitude: entry.coordinates.longitude,
          },
          estimatedArrivalTime,
          estimatedDuration: settings.stopDurationMinutes,
        } as RouteStop;
      })
      .filter((stop: RouteStop | null): stop is RouteStop => stop !== null);

    const totalDistanceMeters = route.metrics?.travelDistanceMeters || 0;
    const totalDurationSeconds = route.metrics?.totalDuration?.seconds
      ? parseInt(route.metrics.totalDuration.seconds)
      : 0;

    return {
      ...this.routeIdentity(routable),
      totalDistance: totalDistanceMeters,
      totalDuration: Math.round(totalDurationSeconds / 60),
      stops,
      startLocation: settings.depot,
      endLocation: settings.depot,
      mode: 'google',
    };
  }

  /**
   * Estimativa local usada quando não há Google configurado ou disponível.
   * O campo `mode: 'simulated'` existe para que o cliente nunca confunda isto
   * com uma rota real.
   */
  private createSimulatedRoute(
    routable: RoutableStop[],
    settings: RoutingSettings,
  ): OptimizedRoute {
    const stops: RouteStop[] = routable.map((entry, index) => ({
      orderId: entry.order.order_id,
      clientName: entry.order.client?.name || entry.order.title || 'Entrega avulsa',
      address: this.formatAddress(entry.order),
      coordinates: {
        latitude: entry.coordinates.latitude,
        longitude: entry.coordinates.longitude,
      },
      estimatedArrivalTime: this.calculateEstimatedTime(index, settings.stopDurationMinutes),
      estimatedDuration: settings.stopDurationMinutes,
    }));

    return {
      ...this.routeIdentity(routable),
      totalDistance: stops.length * 5000,
      totalDuration: stops.length * settings.stopDurationMinutes,
      stops,
      startLocation: settings.depot,
      endLocation: settings.depot,
      mode: 'simulated',
    };
  }

  private routeIdentity(routable: RoutableStop[]) {
    const first = routable[0].order;
    return {
      vehicleId: first.vehicle_id,
      vehicleName: first.vehicle?.name || 'Veículo não encontrado',
      driverId: first.driver_id,
      driverName: first.driver?.name || 'Motorista não encontrado',
    };
  }

  private formatAddress(order: any): string {
    return [
      order.delivery_street,
      order.delivery_number,
      order.delivery_complement,
      order.delivery_district,
      order.delivery_city,
      order.delivery_state,
    ]
      .filter((part) => part)
      .join(', ');
  }

  private calculateEstimatedTime(stopIndex: number, stopDurationMinutes: number): string {
    const now = new Date();
    return new Date(
      now.getTime() + (stopIndex + 1) * stopDurationMinutes * 60000,
    ).toISOString();
  }
}
