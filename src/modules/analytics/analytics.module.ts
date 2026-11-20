import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { RouteMetricsService } from './route-metrics.service';
import { Route } from '../../shared/entities/route.entity';
import { Order } from '../../shared/entities/order.entity';
import { Company } from '../../shared/entities/company.entity';
import { RouteEvent } from '../../shared/entities/route-event.entity';
import { RouteLocationPing } from '../../shared/entities/route-location-ping.entity';
import { RouteExecutionMetrics } from '../../shared/entities/route-execution-metrics.entity';
import { OptimizedRouteHistory } from '../../shared/entities/optimized-route-history.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Route,
      Order,
      Company,
      RouteEvent,
      RouteLocationPing,
      RouteExecutionMetrics,
      OptimizedRouteHistory,
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, RouteMetricsService],
  exports: [RouteMetricsService],
})
export class AnalyticsModule {}
