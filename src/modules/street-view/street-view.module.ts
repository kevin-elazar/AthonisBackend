import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StreetViewController } from './controllers/street-view.controller';
import { StreetViewService } from './services/street-view.service';
import { StreetViewCache } from '../../shared/entities/street-view-cache.entity';
import { Order } from '../../shared/entities/order.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StreetViewCache,
      Order
    ])
  ],
  controllers: [StreetViewController],
  providers: [StreetViewService],
  exports: [StreetViewService]
})
export class StreetViewModule {}

