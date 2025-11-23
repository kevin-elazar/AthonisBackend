import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderImportsController } from './controllers/order-imports.controller';
import { OrderImportsService } from './services/order-imports.service';
import { OrdersModule } from '../orders/orders.module';
import { Order } from '../../shared/entities/order.entity';
import { Client } from '../../shared/entities/client.entity';
import { Vehicle } from '../../shared/entities/vehicle.entity';
import { Driver } from '../../shared/entities/driver.entity';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
    TypeOrmModule.forFeature([Order, Client, Vehicle, Driver]),
    OrdersModule,
  ],
  controllers: [OrderImportsController],
  providers: [OrderImportsService],
  exports: [OrderImportsService],
})
export class OrderImportsModule {}

