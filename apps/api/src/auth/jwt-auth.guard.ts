import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { verifyAccessToken } from '@idepot/auth';
import { IS_PUBLIC_KEY } from './public.decorator.js';

export interface Principal {
  userId: string;
  tenantId: string;
  roles: string[];
  displayName: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    principal?: Principal;
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing bearer token');
    }
    try {
      const p = verifyAccessToken(header.slice('Bearer '.length));
      req.principal = {
        userId: p.sub,
        tenantId: p.tenant,
        roles: p.roles,
        displayName: p.displayName,
      };
      return true;
    } catch {
      throw new UnauthorizedException('invalid access token');
    }
  }
}
