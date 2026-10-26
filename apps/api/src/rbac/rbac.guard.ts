import type { CanActivate, ExecutionContext} from '@nestjs/common';
import { ForbiddenException, Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { Reflector } from '@nestjs/core';
import { hasPermission, type Permission } from '@idepot/auth';
import { PERMISSIONS_KEY } from './permissions.decorator.js';
import type { Principal } from '../auth/jwt-auth.guard.js';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;
    const req = context.switchToHttp().getRequest();
    const principal = req.principal as Principal | undefined;
    if (!principal) {
      throw new ForbiddenException('no principal (JwtAuthGuard must run first)');
    }
    if (!hasPermission(principal.roles, required)) {
      throw new ForbiddenException(`missing permission(s): ${required.join(', ')}`);
    }
    return true;
  }
}
