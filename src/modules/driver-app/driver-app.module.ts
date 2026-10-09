import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RoutesModule } from '../routes/routes.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { DriverAppController } from './controllers/driver-app.controller';
import { DriverAccessController } from './controllers/driver-access.controller';
import { DriverRoutesService } from './services/driver-routes.service';
import { DriverAccessService } from './services/driver-access.service';
import { User } from '../../shared/entities/user.entity';
import { Driver } from '../../shared/entities/driver.entity';
import { Route } from '../../shared/entities/route.entity';
import { Order } from '../../shared/entities/order.entity';
import { Company } from '../../shared/entities/company.entity';
import { RouteEvent } from '../../shared/entities/route-event.entity';
import { RouteLocationPing } from '../../shared/entities/route-location-ping.entity';
import { Vehicle } from '../../shared/entities/vehicle.entity';
import { OptimizedRouteHistory } from '../../shared/entities/optimized-route-history.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Driver,
      Vehicle,
      Route,
      Order,
      Company,
      RouteEvent,
      RouteLocationPing,
      OptimizedRouteHistory,
    ]),
    AuthModule,
    RoutesModule,
    AnalyticsModule,
  ],
  controllers: [DriverAppController, DriverAccessController],
  providers: [DriverRoutesService, DriverAccessService],
  exports: [DriverRoutesService],
})
export class DriverAppModule {}
