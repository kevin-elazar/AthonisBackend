import { Injectable, Logger, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { StreetViewCache } from '../../../shared/entities/street-view-cache.entity';
import { Order } from '../../../shared/entities/order.entity';
import { StreetViewResponseDto } from '../dto/street-view-response.dto';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';
import { config } from '../../../config/env.config';

interface StreetViewMetadataResponse {
  status: string;
  pano_id?: string;
  location?: {
    lat: number;
    lng: number;
  };
  date?: string;
  copyright?: string;
}

@Injectable()
export class StreetViewService {
  private readonly logger = new Logger(StreetViewService.name);
  private readonly apiKey: string;
  private readonly metadataUrl = 'https://maps.googleapis.com/maps/api/streetview/metadata';
  private readonly imageBaseUrl = 'https://maps.googleapis.com/maps/api/streetview';

  constructor(
    @InjectRepository(StreetViewCache)
    private streetViewCacheRepository: Repository<StreetViewCache>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    private tenantContext: TenantContextService,
  ) {
    // Reutiliza a mesma chave do Geocoding — server-side apenas.
    this.apiKey = config.google.geocodingApiKey;
    if (!this.apiKey) {
      this.logger.warn('Chave Google não configurada corretamente. Street View não funcionará.');
    }
  }

  async getStreetViewData(orderId: number): Promise<StreetViewResponseDto> {
    try {
      const idCompany = this.tenantContext.getIdCompany();

      // 1. Buscar o pedido (filtrando por empresa)
      const order = await this.orderRepository.findOne({
        where: { order_id: orderId, id_company: idCompany }
      });

      if (!order) {
        throw new NotFoundException(`Pedido ${orderId} não encontrado`);
      }

      // 2. Verificar se já existe cache
      const cachedData = await this.streetViewCacheRepository.findOne({
        where: { order_id: orderId, id_company: idCompany }
      });

      if (cachedData) {
        this.logger.debug(`Cache encontrado para pedido ${orderId}`);
        return this.formatResponse(cachedData);
      }

      // 3. Buscar dados da API do Google Street View
      this.logger.log(`Buscando dados do Street View para pedido ${orderId}`);
      const address = this.formatAddress(order);
      const streetViewData = await this.fetchStreetViewMetadata(address);

      // 4. Salvar no cache
      const cacheEntry = await this.saveToCache(orderId, idCompany, address, streetViewData);

      // 5. Retornar resposta formatada
      return this.formatResponse(cacheEntry);

    } catch (error) {
      this.logger.error(`Erro ao buscar Street View para pedido ${orderId}:`, error);
      
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Erro ao buscar dados do Street View',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private async fetchStreetViewMetadata(address: string): Promise<StreetViewMetadataResponse> {
    if (!this.apiKey) {
      throw new HttpException(
        'API Key do Google Street View não configurada',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    try {
      this.logger.debug(`Buscando metadados do Street View para: ${address}`);

      const response = await axios.get(this.metadataUrl, {
        params: {
          location: address,
          key: this.apiKey
        }
      });

      return response.data;

    } catch (error) {
      this.logger.error(`Erro na API do Street View para endereço: ${address}`, error);
      
      throw new HttpException(
        'Erro ao consultar API do Google Street View',
        HttpStatus.BAD_GATEWAY
      );
    }
  }

  private async saveToCache(
    orderId: number,
    idCompany: number,
    address: string, 
    metadata: StreetViewMetadataResponse
  ): Promise<StreetViewCache> {
    // Guardamos apenas o caminho do proxy interno. A URL real do Google
    // carrega a API key e por isso nunca é persistida nem devolvida ao cliente.
    const imageUrl =
      metadata.status === 'OK' && (metadata.pano_id || metadata.location)
        ? this.buildProxyImagePath(orderId)
        : null;

    const user = this.tenantContext.getUser();
    const createdBy = user?.email ?? undefined;

    const cacheEntry = this.streetViewCacheRepository.create({
      order_id: orderId,
      id_company: idCompany,
      address: address,
      status: metadata.status,
      pano_id: metadata.pano_id || null,
      latitude: metadata.location?.lat || null,
      longitude: metadata.location?.lng || null,
      capture_date: metadata.date || null,
      image_url: imageUrl,
      created_by: createdBy,
    });

    return await this.streetViewCacheRepository.save(cacheEntry);
  }

  /**
   * Caminho servido pelo próprio backend. É isto que vai para o banco e para
   * o cliente — a API key fica exclusivamente no servidor.
   */
  private buildProxyImagePath(orderId: number): string {
    return `/street-view/order/${orderId}/image`;
  }

  /**
   * URL real do Google, montada apenas no momento de buscar a imagem
   * server-side. Nunca é persistida nem serializada em resposta.
   */
  private buildGoogleImageUrl(
    cache: Pick<StreetViewCache, 'pano_id' | 'latitude' | 'longitude'>,
    size = '640x640',
    heading = 0,
    pitch = 0,
    fov = 120,
  ): string | null {
    const params = new URLSearchParams({
      size,
      heading: String(heading),
      pitch: String(pitch),
      fov: String(fov),
      key: this.apiKey,
    });

    if (cache.pano_id) {
      params.set('pano', cache.pano_id);
    } else if (cache.latitude != null && cache.longitude != null) {
      params.set('location', `${cache.latitude},${cache.longitude}`);
    } else {
      return null;
    }

    return `${this.imageBaseUrl}?${params.toString()}`;
  }

  /**
   * Busca a imagem no Google server-side e devolve os bytes, para que o
   * controller faça o streaming sem expor a credencial.
   */
  async getStreetViewImage(
    orderId: number,
  ): Promise<{ data: Buffer; contentType: string }> {
    if (!this.apiKey) {
      throw new HttpException(
        'API Key do Google Street View não configurada',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const idCompany = this.tenantContext.getIdCompany();

    // Garante que o pedido é da empresa do usuário antes de gastar cota.
    const cache = await this.streetViewCacheRepository.findOne({
      where: { order_id: orderId, id_company: idCompany },
    });

    if (!cache) {
      // Ainda não consultado: busca os metadados primeiro (já valida o tenant).
      await this.getStreetViewData(orderId);
      const created = await this.streetViewCacheRepository.findOne({
        where: { order_id: orderId, id_company: idCompany },
      });
      if (!created) {
        throw new NotFoundException(`Street View indisponível para o pedido ${orderId}`);
      }
      return this.downloadImage(created);
    }

    return this.downloadImage(cache);
  }

  private async downloadImage(
    cache: StreetViewCache,
  ): Promise<{ data: Buffer; contentType: string }> {
    const url = this.buildGoogleImageUrl(cache);

    if (!url) {
      throw new NotFoundException('Não há imagem de Street View para este endereço');
    }

    try {
      const response = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
      });

      return {
        data: Buffer.from(response.data),
        contentType: String(response.headers['content-type'] ?? 'image/jpeg'),
      };
    } catch (error) {
      this.logger.error(`Erro ao baixar imagem do Street View do pedido ${cache.order_id}`, error);
      throw new HttpException(
        'Erro ao obter imagem do Street View',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private formatAddress(order: Order): string {
    const parts = [
      order.delivery_street,
      order.delivery_number,
      order.delivery_complement,
      order.delivery_district,
      order.delivery_city,
      order.delivery_state,
      order.delivery_zipcode
    ].filter(part => part);

    return parts.join(', ');
  }

  private formatResponse(cache: StreetViewCache): StreetViewResponseDto {
    const hasStreetView = cache.status === 'OK';

    // Sempre o caminho do proxy interno — a URL do Google fica no servidor.
    const imageUrl = hasStreetView ? this.buildProxyImagePath(cache.order_id) : null;

    return {
      success: true,
      message: hasStreetView 
        ? 'Dados do Street View encontrados' 
        : 'Não há cobertura do Street View para este endereço',
      orderId: cache.order_id,
      address: cache.address,
      status: cache.status,
      hasStreetView: hasStreetView,
      panoId: cache.pano_id || undefined,
      coordinates: cache.latitude && cache.longitude 
        ? { latitude: Number(cache.latitude), longitude: Number(cache.longitude) }
        : undefined,
      captureDate: cache.capture_date || undefined,
      imageUrl: imageUrl || undefined,
      cachedAt: cache.created_at
    };
  }

  // Método para invalidar cache (útil se precisar forçar atualização)
  async invalidateCache(orderId: number): Promise<void> {
    const idCompany = this.tenantContext.getIdCompany();
    await this.streetViewCacheRepository.delete({ order_id: orderId, id_company: idCompany });
    this.logger.log(`Cache do Street View invalidado para pedido ${orderId}`);
  }

  // Método para buscar múltiplos pedidos de uma vez
  async getStreetViewDataBatch(orderIds: number[]): Promise<StreetViewResponseDto[]> {
    const results: StreetViewResponseDto[] = [];

    for (const orderId of orderIds) {
      try {
        const result = await this.getStreetViewData(orderId);
        results.push(result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro ao buscar dados';
        this.logger.warn(`Falha ao buscar Street View para pedido ${orderId}:`, errorMessage);
        results.push({
          success: false,
          message: errorMessage,
          orderId: orderId,
          address: '',
          status: 'ERROR',
          hasStreetView: false
        });
      }

      // Pequena pausa entre requisições para evitar rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }
}

