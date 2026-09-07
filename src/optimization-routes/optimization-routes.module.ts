import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OptimizationRoutesController } from './controllers/optimization-routes.controller';
import { OptimizedRoutesHistoryController } from './controllers/optimized-routes-history.controller';
import { OptimizationRoutesService } from './services/optimization-routes.service';
import { OptimizedRoutesHistoryService } from './services/optimized-routes-history.service';
import { GeocodingService } from './services/geocoding.service';
import { Order } from '../shared/entities/order.entity';
import { Client } from '../shared/entities/client.entity';
import { Driver } from '../shared/entities/driver.entity';
import { Vehicle } from '../shared/entities/vehicle.entity';
import { OptimizedRouteHistory } from '../shared/entities/optimized-route-history.entity';
import { CompanyModule } from '../modules/company/company.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order, 
      Client, 
      Driver, 
      Vehicle,
      OptimizedRouteHistory
    ]),
    // Depósito, custos e tempo de parada vêm do cadastro da empresa.
    CompanyModule
  ],
  controllers: [
    OptimizationRoutesController,
    OptimizedRoutesHistoryController
  ],
  providers: [
    OptimizationRoutesService,
    OptimizedRoutesHistoryService,
    GeocodingService
  ],
  exports: [
    OptimizationRoutesService,
    OptimizedRoutesHistoryService,
    GeocodingService
  ]
})
export class OptimizationRoutesModule {}
