import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeocodeCache } from '../entities/geocode-cache.entity';
import { GeocodingService } from '../../optimization-routes/services/geocoding.service';
import { AddressCoordinatesService } from '../../optimization-routes/services/address-coordinates.service';

/**
 * Resolução de coordenadas, compartilhada.
 *
 * Cliente, empresa e roteirização precisam da mesma coisa: transformar um
 * endereço em ponto no mapa, gastando o mínimo de consulta paga. Deixar isso
 * dentro do módulo de otimização obrigava quem só quer geocodificar a depender
 * do otimizador inteiro — e, no caso da empresa, criaria dependência circular,
 * já que a otimização lê o depósito do cadastro dela.
 */
@Module({
  imports: [TypeOrmModule.forFeature([GeocodeCache])],
  providers: [GeocodingService, AddressCoordinatesService],
  exports: [GeocodingService, AddressCoordinatesService],
})
export class GeocodingModule {}
