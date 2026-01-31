import { Injectable, HttpException, HttpStatus, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../../shared/entities/order.entity';
import { Client } from '../../shared/entities/client.entity';
import { Driver } from '../../shared/entities/driver.entity';
import { Vehicle } from '../../shared/entities/vehicle.entity';
import { OptimizationResultDto, OptimizedRoute, RouteStop } from '../dto/optimization-result.dto';
import { GeocodingService } from './geocoding.service';
import { OptimizedRoutesHistoryService } from './optimized-routes-history.service';
import { GoogleMapsRouteOptimization } from '../server';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';

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
  ) {
    // Inicializar cliente do Google Maps se as credenciais estiverem disponíveis
    const projectId = process.env.GOOGLE_PROJECT_ID;
    if (projectId) {
      this.googleMapsClient = new GoogleMapsRouteOptimization(projectId);
    }
  }

  async validateOrders(orderIds: number[]): Promise<{
    validOrders: number[];
    invalidOrders: number[];
  }> {
    try {
      const idCompany = this.tenantContext.getIdCompany();
      // Buscar todos os pedidos solicitados (filtrando por empresa)
      const orders = await this.orderRepository.find({
        where: orderIds.map(id => ({ order_id: id, id_company: idCompany })),
        relations: ['client', 'driver', 'vehicle']
      });

      const foundOrderIds = orders.map(order => order.order_id);
      const invalidOrders = orderIds.filter(id => !foundOrderIds.includes(id));

      // Verificar se os pedidos têm dados necessários para otimização
      const validOrders = orders
        .filter(order => this.isOrderValidForOptimization(order))
        .map(order => order.order_id);

      return {
        validOrders,
        invalidOrders
      };
    } catch (error) {
      this.logger.error('Erro na validação de pedidos:', error);
      throw new HttpException(
        'Erro ao validar pedidos',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async optimizeRoutes(orderIds: number[]): Promise<OptimizationResultDto> {
    const startTime = Date.now();
    let googleApiResponse: any = null;
    
    try {
      this.logger.log(`Iniciando otimização para ${orderIds.length} pedidos`);

      // Validar pedidos
      const validation = await this.validateOrders(orderIds);
      
      if (validation.invalidOrders.length > 0) {
        throw new HttpException(
          {
            success: false,
            message: `Pedidos inválidos encontrados: ${validation.invalidOrders.join(', ')}`,
            invalidOrders: validation.invalidOrders
          },
          HttpStatus.BAD_REQUEST
        );
      }

      if (validation.validOrders.length === 0) {
        throw new HttpException(
          {
            success: false,
            message: 'Nenhum pedido válido encontrado para otimização'
          },
          HttpStatus.BAD_REQUEST
        );
      }

      // Buscar dados completos dos pedidos válidos
      const orders = await this.getOrdersWithDetails(validation.validOrders);
      
      // Agrupar pedidos por veículo/motorista
      const groupedOrders = this.groupOrdersByVehicleAndDriver(orders);
      
      // Criar rotas otimizadas e capturar resposta da API
      const { routes, apiResponse } = await this.createOptimizedRoutesWithApiResponse(groupedOrders);
      googleApiResponse = apiResponse;

      const optimizationTime = Date.now() - startTime;

      const result: OptimizationResultDto = {
        success: true,
        message: 'Rotas otimizadas com sucesso',
        totalRoutes: routes.length,
        totalOrders: validation.validOrders.length,
        optimizationTime,
        routes,
        unassignedOrders: validation.invalidOrders
      };

      // Salvar histórico no banco de dados
      try {
        await this.historyService.create({
          order_ids: validation.validOrders,
          total_routes: routes.length,
          total_orders: validation.validOrders.length,
          optimization_time_ms: optimizationTime,
          google_api_response: JSON.stringify(googleApiResponse || {}),
          optimization_result: JSON.stringify(result),
          status: 'success',
          notes: `Otimização realizada com ${routes.length} rota(s) criada(s)`,
        });
        this.logger.log('Histórico de otimização salvo com sucesso');
      } catch (historyError) {
        // Não falhar a otimização se houver erro ao salvar histórico
        this.logger.error('Erro ao salvar histórico de otimização:', historyError);
      }

      return result;

    } catch (error) {
      this.logger.error('Erro na otimização de rotas:', error);
      
      // Tentar salvar histórico de erro
      try {
        await this.historyService.create({
          order_ids: orderIds,
          total_routes: 0,
          total_orders: orderIds.length,
          optimization_time_ms: Date.now() - startTime,
          google_api_response: JSON.stringify(googleApiResponse || {}),
          optimization_result: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Erro desconhecido'
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
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private isOrderValidForOptimization(order: Order): boolean {
    // Verificar se o pedido tem os dados necessários
    return !!(
      order.client_id &&
      order.delivery_street &&
      order.delivery_city &&
      order.delivery_state &&
      order.vehicle_id &&
      order.driver_id
    );
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
    
    orders.forEach(order => {
      const key = `${order.vehicle_id}-${order.driver_id}`;
      
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      
      grouped.get(key)!.push(order);
    });
    
    return grouped;
  }

  private async createOptimizedRoutes(groupedOrders: Map<string, any[]>): Promise<OptimizedRoute[]> {
    const routes: OptimizedRoute[] = [];
    
    for (const [key, orders] of groupedOrders) {
      try {
        const route = await this.createRouteForGroup(orders);
        routes.push(route);
      } catch (error) {
        this.logger.error(`Erro ao criar rota para grupo ${key}:`, error);
        // Continuar com outros grupos mesmo se um falhar
      }
    }
    
    return routes;
  }

  private async createOptimizedRoutesWithApiResponse(
    groupedOrders: Map<string, any[]>
  ): Promise<{ routes: OptimizedRoute[]; apiResponse: any[] }> {
    const routes: OptimizedRoute[] = [];
    const apiResponses: any[] = [];
    
    for (const [key, orders] of groupedOrders) {
      try {
        const { route, apiResponse } = await this.createRouteForGroupWithApiResponse(orders);
        routes.push(route);
        if (apiResponse) {
          apiResponses.push(apiResponse);
        }
      } catch (error) {
        this.logger.error(`Erro ao criar rota para grupo ${key}:`, error);
        // Continuar com outros grupos mesmo se um falhar
      }
    }
    
    return { routes, apiResponse: apiResponses };
  }

  private async createRouteForGroup(orders: any[]): Promise<OptimizedRoute> {
    const firstOrder = orders[0];
    
    // Obter coordenadas reais dos endereços
    const addresses = orders.map(order => this.formatAddress(order));
    let coordinates: any[] = [];
    
    try {
      // Tentar usar geocoding real
      const geocodingResults = await this.geocodingService.geocodeMultipleAddresses(addresses);
      coordinates = geocodingResults;
    } catch (error) {
      this.logger.warn('Falha no geocoding, usando coordenadas simuladas:', error instanceof Error ? error.message : String(error));
      // Fallback para coordenadas simuladas
      coordinates = orders.map(order => 
        this.geocodingService.getSimulatedCoordinates(order.delivery_city, this.formatAddress(order))
      );
    }
    
    // Se temos cliente do Google Maps, usar API real
    if (this.googleMapsClient) {
      try {
        return await this.createRouteWithGoogleMaps(orders, coordinates);
      } catch (error) {
        this.logger.warn('Falha na API do Google Maps, usando simulação:', error instanceof Error ? error.message : String(error));
      }
    }
    
    // Fallback para rota simulada
    return this.createSimulatedRoute(orders, coordinates);
  }

  private async createRouteForGroupWithApiResponse(
    orders: any[]
  ): Promise<{ route: OptimizedRoute; apiResponse: any | null }> {
    const firstOrder = orders[0];
    
    // Obter coordenadas reais dos endereços
    const addresses = orders.map(order => this.formatAddress(order));
    let coordinates: any[] = [];
    
    try {
      // Tentar usar geocoding real
      const geocodingResults = await this.geocodingService.geocodeMultipleAddresses(addresses);
      coordinates = geocodingResults;
    } catch (error) {
      this.logger.warn('Falha no geocoding, usando coordenadas simuladas:', error instanceof Error ? error.message : String(error));
      // Fallback para coordenadas simuladas
      coordinates = orders.map(order => 
        this.geocodingService.getSimulatedCoordinates(order.delivery_city, this.formatAddress(order))
      );
    }
    
    // Se temos cliente do Google Maps, usar API real
    if (this.googleMapsClient) {
      try {
        const { route, apiResponse } = await this.createRouteWithGoogleMapsAndResponse(orders, coordinates);
        return { route, apiResponse };
      } catch (error) {
        this.logger.warn('Falha na API do Google Maps, usando simulação:', error instanceof Error ? error.message : String(error));
      }
    }
    
    // Fallback para rota simulada
    const route = this.createSimulatedRoute(orders, coordinates);
    return { route, apiResponse: null };
  }

  private async createRouteWithGoogleMaps(orders: any[], coordinates: any[]): Promise<OptimizedRoute> {
    const firstOrder = orders[0];
    
    // Preparar modelo para Google Maps API
    const model = {
      vehicles: [{
        startLocation: {
          latitude: -23.5505, // Depósito/Base
          longitude: -46.6333
        },
        endLocation: {
          latitude: -23.5505,
          longitude: -46.6333
        },
        costPerKilometer: 1.0,
        costPerHour: 50.0,
        loadLimits: {
          weight: {
            maxLoad: 1000 // kg
          }
        }
      }],
      shipments: coordinates.map((coord, index) => ({
        pickups: [{
          arrivalLocation: {
            latitude: -23.5505, // Depósito
            longitude: -46.6333
          },
          duration: { seconds: 0 }
        }],
        deliveries: [{
          arrivalLocation: {
            latitude: coord.latitude,
            longitude: coord.longitude
          },
          duration: { seconds: 1800 } // 30 minutos
        }],
        loadDemands: {
          weight: {
            amount: orders[index].quantity || 1
          }
        }
      }))
    };

    // Chamar API do Google Maps
    const response = await this.googleMapsClient.optimizeTours(model);
    
    // Processar resposta e criar rota otimizada
    return this.processGoogleMapsResponse(response, orders, coordinates);
  }

  private async createRouteWithGoogleMapsAndResponse(
    orders: any[], 
    coordinates: any[]
  ): Promise<{ route: OptimizedRoute; apiResponse: any }> {
    const firstOrder = orders[0];
    
    // Preparar modelo para Google Maps API
    const model = {
      vehicles: [{
        startLocation: {
          latitude: -23.5505, // Depósito/Base
          longitude: -46.6333
        },
        endLocation: {
          latitude: -23.5505,
          longitude: -46.6333
        },
        costPerKilometer: 1.0,
        costPerHour: 50.0,
        loadLimits: {
          weight: {
            maxLoad: 1000 // kg
          }
        }
      }],
      shipments: coordinates.map((coord, index) => ({
        pickups: [{
          arrivalLocation: {
            latitude: -23.5505, // Depósito
            longitude: -46.6333
          },
          duration: { seconds: 0 }
        }],
        deliveries: [{
          arrivalLocation: {
            latitude: coord.latitude,
            longitude: coord.longitude
          },
          duration: { seconds: 1800 } // 30 minutos
        }],
        loadDemands: {
          weight: {
            amount: orders[index].quantity || 1
          }
        }
      }))
    };

    // Chamar API do Google Maps
    const response = await this.googleMapsClient.optimizeTours(model);
    
    // Processar resposta e criar rota otimizada
    const route = this.processGoogleMapsResponse(response, orders, coordinates);
    
    return { route, apiResponse: response };
  }

  private processGoogleMapsResponse(response: any, orders: any[], coordinates: any[]): OptimizedRoute {
    const firstOrder = orders[0];
    
    // A resposta é um array, o primeiro elemento contém os dados
    const optimizationResult = response[0];
    
    if (!optimizationResult || !optimizationResult.routes || optimizationResult.routes.length === 0) {
      throw new Error('Nenhuma rota retornada pela API do Google Maps');
    }

    const route = optimizationResult.routes[0];
    
    // Filtrar apenas as visitas de entrega (deliveries), ignorar pickups
    const deliveryVisits = route.visits?.filter((visit: any) => !visit.isPickup) || [];

    const stops: RouteStop[] = deliveryVisits.map((visit: any, index: number) => {
      const shipmentIndex = visit.shipmentIndex;
      const order = orders[shipmentIndex];
      const coord = coordinates[shipmentIndex];
      
      // Converter startTime de seconds para ISO string
      let estimatedArrivalTime = this.calculateEstimatedTime(index);
      if (visit.startTime && visit.startTime.seconds) {
        const startDate = new Date();
        startDate.setSeconds(startDate.getSeconds() + parseInt(visit.startTime.seconds));
        estimatedArrivalTime = startDate.toISOString();
      }
      
      return {
        orderId: order.order_id,
        clientName: order.client?.name || 'Cliente não encontrado',
        address: this.formatAddress(order),
        coordinates: {
          latitude: coord.latitude,
          longitude: coord.longitude
        },
        estimatedArrivalTime: estimatedArrivalTime,
        estimatedDuration: 30 // 30 minutos padrão por parada
      };
    });

    // Converter métricas da resposta
    const totalDistanceMeters = route.metrics?.travelDistanceMeters || 0;
    const totalDurationSeconds = route.metrics?.totalDuration?.seconds 
      ? parseInt(route.metrics.totalDuration.seconds) 
      : 0;

    return {
      vehicleId: firstOrder.vehicle_id,
      vehicleName: firstOrder.vehicle?.name || 'Veículo não encontrado',
      driverId: firstOrder.driver_id,
      driverName: firstOrder.driver?.name || 'Motorista não encontrado',
      totalDistance: totalDistanceMeters, // em metros
      totalDuration: Math.round(totalDurationSeconds / 60), // converter segundos para minutos
      stops,
      startLocation: {
        latitude: -23.5505,
        longitude: -46.6333
      },
      endLocation: {
        latitude: -23.5505,
        longitude: -46.6333
      }
    };
  }

  private createSimulatedRoute(orders: any[], coordinates: any[]): OptimizedRoute {
    const firstOrder = orders[0];
    
    const stops: RouteStop[] = orders.map((order, index) => ({
      orderId: order.order_id,
      clientName: order.client?.name || 'Cliente não encontrado',
      address: this.formatAddress(order),
      coordinates: {
        latitude: coordinates[index]?.latitude || this.getSimulatedLatitude(order.delivery_city),
        longitude: coordinates[index]?.longitude || this.getSimulatedLongitude(order.delivery_city)
      },
      estimatedArrivalTime: this.calculateEstimatedTime(index),
      estimatedDuration: 30 // 30 minutos por parada
    }));

    return {
      vehicleId: firstOrder.vehicle_id,
      vehicleName: firstOrder.vehicle?.name || 'Veículo não encontrado',
      driverId: firstOrder.driver_id,
      driverName: firstOrder.driver?.name || 'Motorista não encontrado',
      totalDistance: stops.length * 5000, // Simulado: 5km por parada
      totalDuration: stops.length * 30, // 30 minutos por parada
      stops,
      startLocation: {
        latitude: -23.5505, // São Paulo
        longitude: -46.6333
      },
      endLocation: {
        latitude: -23.5505,
        longitude: -46.6333
      }
    };
  }

  private formatAddress(order: any): string {
    const parts = [
      order.delivery_street,
      order.delivery_number,
      order.delivery_complement,
      order.delivery_district,
      order.delivery_city,
      order.delivery_state
    ].filter(part => part);
    
    return parts.join(', ');
  }

  private getSimulatedLatitude(city: string): number {
    // Coordenadas simuladas para São Paulo
    const baseLat = -23.5505;
    return baseLat + (Math.random() - 0.5) * 0.1;
  }

  private getSimulatedLongitude(city: string): number {
    // Coordenadas simuladas para São Paulo
    const baseLng = -46.6333;
    return baseLng + (Math.random() - 0.5) * 0.1;
  }

  private calculateEstimatedTime(stopIndex: number): string {
    const now = new Date();
    const estimatedTime = new Date(now.getTime() + (stopIndex + 1) * 30 * 60000); // 30 min por parada
    return estimatedTime.toISOString();
  }
}
