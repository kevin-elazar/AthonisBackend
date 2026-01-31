import { Injectable, Logger, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { StreetViewCache } from '../../../shared/entities/street-view-cache.entity';
import { Order } from '../../../shared/entities/order.entity';
import { StreetViewResponseDto } from '../dto/street-view-response.dto';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';

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
    // Reutiliza a mesma chave do Geocoding
    this.apiKey = process.env.GOOGLE_GEOCODING_API_KEY;
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
    // Usar pano_id quando disponível (melhor para imagens 360), senão usar coordenadas
    const imageUrl = metadata.status === 'OK' 
      ? (metadata.pano_id 
          ? this.buildImageUrlByPanoId(metadata.pano_id)
          : this.buildImageUrl(metadata.location?.lat, metadata.location?.lng))
      : null;

    const cacheEntry = this.streetViewCacheRepository.create({
      order_id: orderId,
      id_company: idCompany,
      address: address,
      status: metadata.status,
      pano_id: metadata.pano_id || null,
      latitude: metadata.location?.lat || null,
      longitude: metadata.location?.lng || null,
      capture_date: metadata.date || null,
      image_url: imageUrl
    });

    return await this.streetViewCacheRepository.save(cacheEntry);
  }

  /**
   * Constrói URL da imagem usando pano_id (recomendado para imagens 360)
   * O pano_id permite acesso direto ao panorama específico
   */
  private buildImageUrlByPanoId(
    panoId: string,
    size: string = '600x400',
    heading: number = 0,
    pitch: number = 0,
    fov: number = 90
  ): string {
    const params = new URLSearchParams({
      size: size,
      pano: panoId,
      heading: heading.toString(),
      pitch: pitch.toString(),
      fov: fov.toString(),
      key: this.apiKey
    });

    return `${this.imageBaseUrl}?${params.toString()}`;
  }

  /**
   * Constrói URL da imagem usando coordenadas (fallback quando pano_id não está disponível)
   */
  private buildImageUrl(
    latitude?: number, 
    longitude?: number, 
    size: string = '600x400',
    heading: number = 0,
    pitch: number = 0,
    fov: number = 90
  ): string {
    if (!latitude || !longitude) {
      return null;
    }

    const params = new URLSearchParams({
      size: size,
      location: `${latitude},${longitude}`,
      heading: heading.toString(),
      pitch: pitch.toString(),
      fov: fov.toString(),
      key: this.apiKey
    });

    return `${this.imageBaseUrl}?${params.toString()}`;
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
    
    // Gerar URL 360 completa se pano_id estiver disponível
    const imageUrl360 = hasStreetView && cache.pano_id
      ? this.buildImageUrlByPanoId(cache.pano_id, '640x640', 0, 0, 120) // FOV maior para visualização 360
      : cache.image_url;

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
      imageUrl: imageUrl360 || cache.image_url || undefined,
      cachedAt: cache.created_at
    };
  }

  /**
   * Gera URL para visualização 360 interativa usando Maps JavaScript API
   * Esta URL pode ser usada no frontend para exibir panorama interativo
   */
  getInteractive360Url(panoId?: string, latitude?: number, longitude?: number): string | null {
    if (!panoId && (!latitude || !longitude)) {
      return null;
    }

    // Para visualização interativa 360, use o Maps JavaScript API no frontend
    // Este método retorna os parâmetros necessários
    const params = panoId 
      ? `pano=${panoId}`
      : `location=${latitude},${longitude}`;
    
    // Nota: Para visualização interativa completa, você precisará usar
    // a Maps JavaScript API no frontend com o StreetViewPanorama
    // Esta URL é apenas uma referência para os parâmetros
    return `streetview://?${params}`;
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

