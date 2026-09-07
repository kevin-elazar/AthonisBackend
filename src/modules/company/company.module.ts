import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../../shared/entities/company.entity';
import { CompanyController } from './controllers/company.controller';
import { CompanyService } from './services/company.service';
import { TenantModule } from '../../shared/tenant/tenant.module';

@Module({
  imports: [TypeOrmModule.forFeature([Company]), TenantModule],
  controllers: [CompanyController],
  providers: [CompanyService],
  // Exportado para a otimização de rotas ler o depósito e os custos da empresa.
  exports: [CompanyService],
})
export class CompanyModule {}
