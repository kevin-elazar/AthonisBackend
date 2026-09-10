import { Injectable, HttpException, HttpStatus, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
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
import { Route } from '../../shared/entities/route.entity';
import { AddressCoordinatesService } from './address-coordinates.service';
import { parseWindowText, zonedTimeToUtc } from '../../shared/domain/timezone';

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
    private addressCoordinates: AddressCoordinatesService,
    private dataSource: DataSource,
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
    // A execução já rendeu um registro de auditoria: um segundo registro, de
    // falha, contaria a mesma tentativa duas vezes.
    let historicoSalvo = false;

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
        const historico = await this.historyService.create({
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
        historicoSalvo = true;

        // A rota vira registro próprio aqui. O histórico é auditoria da
        // chamada à API; é esta parte que a operação manipula depois.
        await this.persistRoutes(routes, historico.id);
      } catch (persistError) {
        this.logger.error('Erro ao gravar as rotas geradas:', persistError);

        // Sem rota gravada não há o que despachar: falhar é mais honesto do
        // que devolver sucesso para uma otimização que não deixou rastro.
        if (historicoSalvo) {
          throw new HttpException(
            {
              success: false,
              message:
                'A otimização foi concluída, mas as rotas não puderam ser gravadas. Tente novamente.',
            },
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        this.logger.error('Erro ao salvar histórico de otimização:', persistError);
      }

      return result;
    } catch (error) {
      this.logger.error('Erro na otimização de rotas:', error);

      if (!historicoSalvo) {
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
   * Grava cada rota gerada como registro próprio e carimba os pedidos.
   *
   * É o que dá identidade à rota: sem isso ela existiria apenas como um
   * pedaço do JSON do histórico, e não haveria como responder "em que rota
   * está este pedido", iniciar a rota ou apagar uma sem apagar as irmãs.
   */
  private async persistRoutes(routes: OptimizedRoute[], historyId: number): Promise<void> {
    if (routes.length === 0) return;

    const idCompany = this.tenantContext.getIdCompany();
    const autor = this.tenantContext.getUser()?.email ?? undefined;

    // Tudo numa transação: uma rota gravada com metade dos pedidos carimbados
    // deixaria o resto dos pedidos livres para entrar em outra rota.
    await this.dataSource.transaction(async (manager) => {
      for (const rota of routes) {
        const orderIds = rota.stops.map((stop) => stop.orderId);
        if (orderIds.length === 0) continue;

        const pedidos = await manager.find(Order, {
          where: { order_id: In(orderIds), id_company: idCompany },
        });
        const primeiro = pedidos.find((pedido) => pedido.order_id === orderIds[0]);

        const salva = await manager.save(
          manager.create(Route, {
            id_company: idCompany,
            history_id: historyId,
            driver_id: rota.driverId ?? undefined,
            vehicle_id: rota.vehicleId ?? undefined,
            status: 'planned' as const,
            planned_date: primeiro?.delivery_date,
            total_distance_m: Math.round(rota.totalDistance ?? 0),
            total_duration_min: Math.round(rota.totalDuration ?? 0),
            simulated: rota.mode === 'simulated',
            region: primeiro?.delivery_city,
            created_by: autor,
          }),
        );

        // A posição da parada vem da ordem devolvida pela otimização: é ela
        // que diz em que sequência o motorista deve entregar.
        for (const [indice, stop] of rota.stops.entries()) {
          const pedido = pedidos.find((item) => item.order_id === stop.orderId);

          // Guardamos junto o endereço que gerou a coordenada: se o endereço
          // for editado depois, a chave deixa de bater e a coordenada é
          // resolvida de novo em vez de continuar apontando para o lugar antigo.
          const chave = pedido
            ? this.addressCoordinates.keyFor({
                street: pedido.delivery_street,
                number: pedido.delivery_number,
                district: pedido.delivery_district,
                city: pedido.delivery_city,
                state: pedido.delivery_state,
                zipCode: pedido.delivery_zipcode,
              })
            : null;

          await manager.update(
            Order,
            { order_id: stop.orderId, id_company: idCompany },
            {
              route_id: salva.route_id,
              stop_sequence: indice + 1,
              status: 'planned',
              delivery_latitude: stop.coordinates?.latitude,
              delivery_longitude: stop.coordinates?.longitude,
              delivery_geocoded_address: chave ?? undefined,
              updated_by: autor,
            },
          );
        }
      }
    });
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
    // Já está numa rota: roteirizar de novo criaria duas rotas disputando a
    // mesma entrega, e a segunda sobrescreveria a primeira sem aviso.
    if (order.route_id) {
      return 'Pedido já faz parte de uma rota';
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

  /**
   * Coordenada do pedido, na ordem do mais barato para o mais caro.
   *
   * Antes cada roteirização geocodificava todos os endereços de novo, então o
   * custo era "pedidos × execuções". Aqui só chega ao geocoding o endereço
   * que ninguém resolveu ainda.
   */
  private async resolveOrderCoordinates(order: any): Promise<GeocodingResult | null> {
    const parts = {
      street: order.delivery_street,
      number: order.delivery_number,
      district: order.delivery_district,
      city: order.delivery_city,
      state: order.delivery_state,
      zipCode: order.delivery_zipcode,
    };
    const key = this.addressCoordinates.keyFor(parts);
    const linha = this.formatAddress(order);

    // 1. Já resolvido antes, e o endereço do pedido não mudou desde então.
    if (
      this.addressCoordinates.storedIsFresh(
        order.delivery_geocoded_address,
        order.delivery_latitude,
        order.delivery_longitude,
        key,
      )
    ) {
      return {
        latitude: Number(order.delivery_latitude),
        longitude: Number(order.delivery_longitude),
        formattedAddress: linha,
      };
    }

    // 2. O pedido entrega no endereço cadastrado do cliente: a coordenada é a
    //    mesma, e este é o caso mais comum da operação.
    const client = order.client;
    if (client && key) {
      const clientKey = this.addressCoordinates.keyFor({
        street: client.street,
        number: client.number,
        district: client.neighborhood,
        city: client.city,
        state: client.state,
        zipCode: client.zip_code,
      });

      if (
        clientKey === key &&
        client.latitude !== null &&
        client.latitude !== undefined &&
        client.longitude !== null &&
        client.longitude !== undefined
      ) {
        return {
          latitude: Number(client.latitude),
          longitude: Number(client.longitude),
          formattedAddress: linha,
        };
      }
    }

    // 3. e 4. Cache de endereços e, só em último caso, o geocoding.
    const resolvido = await this.addressCoordinates.resolve(parts, order.delivery_city);
    if (!resolvido) return null;

    return {
      latitude: resolvido.latitude,
      longitude: resolvido.longitude,
      formattedAddress: linha,
    };
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
    const coordinates: (GeocodingResult | null)[] = [];

    for (const order of orders) {
      coordinates.push(await this.resolveOrderCoordinates(order));
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

    const { globalStartTime, globalEndTime } = this.buildGlobalTimeWindow(routable, settings);

    return {
      globalStartTime,
      globalEndTime,
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
            timeWindows: this.buildDeliveryTimeWindows(stop.order, settings),
          },
        ],
        loadDemands: {
          weight: { amount: stop.order.quantity || 1 },
        },
      })),
    };
  }

  /**
   * Janela de entrega do pedido, convertida para UTC.
   *
   * Sem isso o campo "08:00 - 12:00" era só um texto exibido em tela: o
   * otimizador não sabia que a entrega tinha hora marcada e podia sequenciar
   * a parada para qualquer momento do dia, inclusive fora da janela combinada
   * com o cliente.
   *
   * Sem janela própria, a entrega vale para o expediente inteiro — não impomos
   * restrição nenhuma além da que já existe no início/fim global do modelo.
   */
  private buildDeliveryTimeWindows(order: any, settings: RoutingSettings) {
    const janela = parseWindowText(order.delivery_window);
    if (!janela || !order.delivery_date) return undefined;

    const inicio = zonedTimeToUtc(order.delivery_date, janela.inicio, settings.timezone);
    const fim = zonedTimeToUtc(order.delivery_date, janela.fim, settings.timezone);

    return [
      {
        startTime: { seconds: Math.floor(inicio.getTime() / 1000) },
        endTime: { seconds: Math.floor(fim.getTime() / 1000) },
      },
    ];
  }

  /**
   * Início e fim do expediente, em UTC, cobrindo todos os dias de entrega do
   * grupo. A Route Optimization exige um intervalo global mesmo quando os
   * pedidos não têm janela própria — sem ele, o modelo assume "agora" como
   * início, e a rota planejada para semana que vem sairia com horários de
   * hoje.
   */
  private buildGlobalTimeWindow(routable: RoutableStop[], settings: RoutingSettings) {
    const hoje = new Date().toISOString().slice(0, 10);
    const datas = routable
      .map((stop) => stop.order.delivery_date)
      .filter((data): data is string => !!data);

    const primeiraData = datas.length > 0 ? datas.reduce((a, b) => (a < b ? a : b)) : hoje;
    const ultimaData = datas.length > 0 ? datas.reduce((a, b) => (a > b ? a : b)) : hoje;

    const inicio = zonedTimeToUtc(primeiraData, settings.operationStartTime, settings.timezone);
    const fim = zonedTimeToUtc(ultimaData, settings.operationEndTime, settings.timezone);

    return {
      globalStartTime: { seconds: Math.floor(inicio.getTime() / 1000) },
      globalEndTime: { seconds: Math.floor(fim.getTime() / 1000) },
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

        // `visit.startTime` é um instante absoluto (epoch), não uma duração a
        // partir de agora. Somar `now() + segundos` — como este código fazia —
        // jogava a chegada décadas no futuro: os segundos aqui já passam de
        // 1,7 bilhão. O bug ficava escondido enquanto o modelo não tinha
        // globalStartTime/globalEndTime, porque nesse caso o Google nem
        // preenchia este campo e o cálculo caía no fallback local abaixo.
        let estimatedArrivalTime = this.calculateEstimatedTime(
          index,
          settings.stopDurationMinutes,
        );
        if (visit.startTime && visit.startTime.seconds !== undefined) {
          estimatedArrivalTime = new Date(
            Number(visit.startTime.seconds) * 1000,
          ).toISOString();
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
