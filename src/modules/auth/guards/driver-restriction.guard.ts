import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_DRIVER_KEY } from '../decorators/allow-driver.decorator';

/**
 * O login do entregador é um usuário como os outros, e a maior parte da API
 * só exige "estar autenticado". Sem este guard, o token do aplicativo leria
 * clientes, pedidos e rotas da empresa inteira.
 *
 * A regra é negar por padrão: um endpoint novo nasce fechado para o papel
 * 'driver' e só abre com @AllowDriver(). Esquecer a marca quebra o app de
 * forma visível; o contrário vazaria dado em silêncio.
 */
@Injectable()
export class DriverRestrictionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (user?.role !== 'driver') {
      return true;
    }

    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_DRIVER_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!allowed) {
      throw new ForbiddenException('Este recurso não está disponível no aplicativo do entregador');
    }
    return true;
  }
}
