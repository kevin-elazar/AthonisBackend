import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OptimizationRoutesController } from './controllers/optimization-routes.controller';
import { OptimizationRoutesService } from './services/optimization-routes.service';
import { GeocodingService } from './services/geocoding.service';
import { Order } from '../shared/entities/order.entity';
import { Client } from '../shared/entities/client.entity';
import { Driver } from '../shared/entities/driver.entity';
import { Vehicle } from '../shared/entities/vehicle.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Client, Driver, Vehicle])
  ],
  controllers: [OptimizationRoutesController],
  providers: [OptimizationRoutesService, GeocodingService],
  exports: [OptimizationRoutesService, GeocodingService]
})
export class OptimizationRoutesModule {}
