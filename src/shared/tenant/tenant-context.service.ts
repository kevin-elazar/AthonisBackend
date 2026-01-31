import { Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { JwtUser } from '../types/jwt-user.interface';

@Injectable({ scope: Scope.REQUEST })
export class TenantContextService {
  private user: JwtUser | null = null;

  setUser(user: JwtUser): void {
    this.user = user;
  }

  getIdCompany(): number {
    if (!this.user) {
      throw new UnauthorizedException('Contexto de tenant não definido');
    }
    return this.user.id_company;
  }

  getUser(): JwtUser | null {
    return this.user;
  }
}
