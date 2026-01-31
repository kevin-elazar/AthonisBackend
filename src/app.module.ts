import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { databaseConfig } from './config/database.config';
import { OrdersModule } from './modules/orders/orders.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { ClientsModule } from './modules/clients/clients.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrderImportsModule } from './modules/order-imports/order-imports.module';
import { OptimizationRoutesModule } from './optimization-routes/optimization-routes.module';
import { StreetViewModule } from './modules/street-view/street-view.module';

import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { TenantModule } from './shared/tenant/tenant.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'medium', ttl: 10000, limit: 50 },
      { name: 'long', ttl: 60000, limit: 100 },
    ]),
    TypeOrmModule.forRoot(databaseConfig),
    TenantModule,
    AuthModule,
    ClientsModule,
    OrdersModule,
    OrderImportsModule,
    DriversModule,
    VehiclesModule,
    OptimizationRoutesModule,
    StreetViewModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}