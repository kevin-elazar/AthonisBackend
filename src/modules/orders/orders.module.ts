import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OrdersService } from "./services/orders.service";
import { OrdersController } from "./controllers/orders.controller";
import { Order } from "../../shared/entities/order.entity";
import { Client } from "../../shared/entities/client.entity";
import { Vehicle } from "../../shared/entities/vehicle.entity";
import { Driver } from "../../shared/entities/driver.entity";
import { TenantModule } from "@/shared/tenant/tenant.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Client, Vehicle, Driver]),
    TenantModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
