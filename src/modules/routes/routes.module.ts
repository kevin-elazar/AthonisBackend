import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoutesController } from './controllers/routes.controller';
import { RoutesService } from './services/routes.service';
import { Route } from '../../shared/entities/route.entity';
import { Order } from '../../shared/entities/order.entity';
import { Driver } from '../../shared/entities/driver.entity';
import { Vehicle } from '../../shared/entities/vehicle.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Route, Order, Driver, Vehicle])],
  controllers: [RoutesController],
  providers: [RoutesService],
  exports: [RoutesService],
})
export class RoutesModule {}
