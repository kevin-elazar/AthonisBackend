import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { config } from '../../config/env.config';

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  placeId?: string;
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/geocode/json';

  constructor() {
    this.apiKey = config.google.geocodingApiKey;
    if (!this.apiKey) {
      this.logger.warn('GOOGLE_GEOCODING_API_KEY não configurada. Geocoding não funcionará.');
    }
  }

  async geocodeAddress(address: string): Promise<GeocodingResult> {
    if (!this.apiKey) {
      throw new HttpException(
        'API Key do Google Geocoding não configurada',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    try {
      this.logger.debug(`Geocoding endereço: ${address}`);

      const response = await axios.get(this.baseUrl, {
        params: {
          address: address,
          key: this.apiKey,
          region: 'br', // Brasil
          language: 'pt-BR'
        }
      });

      if (response.data.status !== 'OK') {
        throw new HttpException(
          `Erro no geocoding: ${response.data.status}`,
          HttpStatus.BAD_REQUEST
        );
      }

      const result = response.data.results[0];
      const location = result.geometry.location;

      return {
        latitude: location.lat,
        longitude: location.lng,
        formattedAddress: result.formatted_address,
        placeId: result.place_id
      };

    } catch (error) {
      this.logger.error(`Erro no geocoding para endereço: ${address}`, error);
      
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Erro ao converter endereço em coordenadas',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Geocodifica vários endereços preservando a posição de cada um.
   *
   * O array devolvido tem SEMPRE o mesmo tamanho da entrada: um endereço que
   * falha vira `null` na própria posição. Filtrar os nulos aqui encurtaria o
   * array e faria o chamador casar coordenada de um pedido com outro — ou
   * seja, entregar no endereço errado.
   */
  async geocodeMultipleAddresses(addresses: string[]): Promise<(GeocodingResult | null)[]> {
    const results: (GeocodingResult | null)[] = [];

    // Processar em lotes para evitar rate limiting
    const batchSize = 5;
    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize);

      const batchPromises = batch.map(address =>
        this.geocodeAddress(address).catch(error => {
          this.logger.warn(`Falha no geocoding para: ${address}`, error.message);
          return null;
        })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Pequena pausa entre lotes
      if (i + batchSize < addresses.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /** Indica se o geocoding real está disponível (chave configurada). */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  // Método para coordenadas simuladas (fallback quando API não está disponível)
  getSimulatedCoordinates(city: string, address: string): GeocodingResult {
    // Coordenadas base para São Paulo
    const baseCoordinates = {
      'São Paulo': { lat: -23.5505, lng: -46.6333 },
      'Rio de Janeiro': { lat: -22.9068, lng: -43.1729 },
      'Belo Horizonte': { lat: -19.9167, lng: -43.9345 },
      'Salvador': { lat: -12.9777, lng: -38.5016 },
      'Brasília': { lat: -15.7801, lng: -47.9292 }
    };

    const cityCoords = baseCoordinates[city] || baseCoordinates['São Paulo'];
    
    // Adicionar pequena variação baseada no endereço
    const hash = this.simpleHash(address);
    const latVariation = (hash % 1000 - 500) / 10000; // ±0.05 graus
    const lngVariation = ((hash >> 10) % 1000 - 500) / 10000;

    return {
      latitude: cityCoords.lat + latVariation,
      longitude: cityCoords.lng + lngVariation,
      formattedAddress: `${address}, ${city}, Brasil`
    };
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}
