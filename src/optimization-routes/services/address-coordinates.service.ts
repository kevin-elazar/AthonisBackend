import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GeocodeCache } from '../../shared/entities/geocode-cache.entity';
import { GeocodingService, GeocodingResult } from './geocoding.service';
import { AddressParts, buildAddressKey, formatAddressLine } from '../../shared/domain/address-key';

export type ResolvedCoordinates = {
  latitude: number;
  longitude: number;
  /** Chave do endereço que gerou a coordenada, para detectar endereço trocado. */
  addressKey: string;
  /** De onde veio — 'simulated' não é gravado no cache nem tratado como real. */
  source: 'stored' | 'cache' | 'geocoding' | 'simulated';
};

/**
 * Resolve as coordenadas de um endereço gastando o mínimo de consulta paga.
 *
 * A ordem de busca vai do mais barato para o mais caro:
 *   1. coordenada já gravada no próprio registro, se o endereço não mudou;
 *   2. coordenada do cliente, quando o pedido entrega no endereço dele;
 *   3. cache de endereços, que atende qualquer registro com o mesmo endereço;
 *   4. geocoding — a única etapa que custa dinheiro.
 *
 * O passo 2 é o atalho mais comum na prática: a maioria dos pedidos entrega
 * no endereço cadastrado do cliente. O passo 3 é o que garante que endereços
 * repetidos entre clientes diferentes, entregas avulsas e cadastros refeitos
 * também não paguem de novo.
 */
@Injectable()
export class AddressCoordinatesService {
  private readonly logger = new Logger(AddressCoordinatesService.name);

  constructor(
    @InjectRepository(GeocodeCache)
    private cacheRepository: Repository<GeocodeCache>,
    private geocodingService: GeocodingService,
  ) {}

  /** Chave do endereço, ou null quando ele é incompleto demais. */
  keyFor(parts: AddressParts): string | null {
    return buildAddressKey(parts);
  }

  /**
   * Coordenada já gravada continua valendo enquanto o endereço for o mesmo.
   * É a comparação que evita repetir o caso do depósito, que apontava para
   * outra cidade porque ninguém percebeu que a coordenada tinha ficado velha.
   */
  storedIsFresh(
    storedKey: string | null | undefined,
    latitude: number | null | undefined,
    longitude: number | null | undefined,
    currentKey: string | null,
  ): boolean {
    return (
      !!currentKey &&
      !!storedKey &&
      storedKey === currentKey &&
      latitude !== null &&
      latitude !== undefined &&
      longitude !== null &&
      longitude !== undefined
    );
  }

  /**
   * Procura no cache e, se não achar, geocodifica e guarda.
   * `fallbackCity` só é usada para a coordenada simulada, quando não há chave
   * de geocoding configurada.
   */
  async resolve(parts: AddressParts, fallbackCity?: string): Promise<ResolvedCoordinates | null> {
    const key = buildAddressKey(parts);
    const linha = formatAddressLine(parts);

    if (!key) {
      this.logger.warn(`Endereço incompleto para geocodificar: "${linha}"`);
      return null;
    }

    const emCache = await this.cacheRepository.findOne({ where: { address_key: key } });
    if (emCache) {
      // O contador mostra quanto o cache está economizando de consulta paga.
      await this.cacheRepository.increment({ id: emCache.id }, 'hits', 1);
      return {
        latitude: Number(emCache.latitude),
        longitude: Number(emCache.longitude),
        addressKey: key,
        source: 'cache',
      };
    }

    if (!this.geocodingService.isConfigured()) {
      const simulada = this.geocodingService.getSimulatedCoordinates(fallbackCity ?? '', linha);
      return {
        latitude: simulada.latitude,
        longitude: simulada.longitude,
        addressKey: key,
        source: 'simulated',
      };
    }

    let resultado: GeocodingResult;
    try {
      resultado = await this.geocodingService.geocodeAddress(linha);
    } catch (erro) {
      this.logger.warn(
        `Geocoding falhou para "${linha}": ${erro instanceof Error ? erro.message : erro}`,
      );
      return null;
    }

    await this.store(key, resultado);

    return {
      latitude: resultado.latitude,
      longitude: resultado.longitude,
      addressKey: key,
      source: 'geocoding',
    };
  }

  /** Guarda no cache, tolerando corrida entre duas roteirizações simultâneas. */
  private async store(key: string, resultado: GeocodingResult): Promise<void> {
    try {
      await this.cacheRepository.save(
        this.cacheRepository.create({
          address_key: key,
          formatted_address: resultado.formattedAddress,
          latitude: resultado.latitude,
          longitude: resultado.longitude,
          provider: 'google',
          hits: 0,
        }),
      );
    } catch (erro) {
      // Chave única violada significa que outra execução gravou primeiro: a
      // coordenada já está lá, não há o que corrigir.
      this.logger.debug(`Endereço já estava no cache: ${key}`);
    }
  }
}
