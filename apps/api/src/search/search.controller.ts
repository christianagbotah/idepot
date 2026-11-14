import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SearchQuerySchema } from '@idepot/contracts';
import { JwtAuthGuard, type Principal } from '../auth/jwt-auth.guard.js';
import { parseBody } from '../parse-body.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { SearchService } from './search.service.js';

/**
 * Phase 6 parity: cross-entity global search (legacy parity gap).
 *
 * Deliberately NOT behind RbacGuard: search is available to every
 * authenticated principal, and the SERVICE filters each entity group by the
 * caller's permissions (a cashier never sees purchase orders). Tenant
 * isolation is the standard UoW RLS session.
 */
@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(@Req() req: Request, @Query('q') q?: string) {
    const principal = req.principal as Principal;
    return this.searchService.search(principal, parseBody(SearchQuerySchema, { q }));
  }
}
