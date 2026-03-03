import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Scope,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { TenantContextService } from "./tenant-context.service";

@Injectable({ scope: Scope.REQUEST }) // 👈 mesma instância por request
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();

    if (request.user) {
      this.tenantContext.setUser(request.user);
    }

    return next.handle();
  }
}
