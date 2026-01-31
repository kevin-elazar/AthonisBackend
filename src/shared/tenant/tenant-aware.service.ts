import { Injectable } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export abstract class TenantAwareService {
  constructor(protected readonly tenantContext: TenantContextService) {}

  protected getIdCompany(): number {
    return this.tenantContext.getIdCompany();
  }
}
