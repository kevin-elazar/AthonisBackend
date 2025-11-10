import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsService } from './services/clients.service';
import { ClientsController } from './controllers/clients.controller';
import { Client } from '../../shared/entities/client.entity';
import { HttpExceptionFilter } from '../../filters/http-exception.filter';
import { APP_FILTER } from '@nestjs/core';

@Module({
  imports: [
    TypeOrmModule.forFeature([Client])
  ],
  controllers: [ClientsController],
  providers: [
    ClientsService,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    }
  ],
})
export class ClientsModule {}
