import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PostSampleDocumentSchema } from '@idepot/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { parseBody } from '../parse-body.js';
import { RequirePermissions } from '../rbac/permissions.decorator.js';
import { RbacGuard } from '../rbac/rbac.guard.js';
import { SampleDocumentService } from './sample-document.service.js';

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('sample-documents')
export class SampleDocumentController {
  constructor(private readonly documents: SampleDocumentService) {}

  /**
   * Posting Coordinator reference endpoint (ADR-0001).
   * `simulateFailureAfterWrites: true` throws AFTER document+audit+outbox writes
   * — the API response is 500 and ZERO rows survive (proved by test).
   */
  @Post()
  @RequirePermissions('sample:post')
  post(@Req() req: Request, @Body() body: unknown) {
    return this.documents.post(req.principal!, parseBody(PostSampleDocumentSchema, body));
  }
}
