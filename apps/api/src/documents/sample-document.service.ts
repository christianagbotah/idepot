import { Injectable } from '@nestjs/common';
import type { PostSampleDocument } from '@idepot/contracts';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork } from '../db/unit-of-work.js';

/** Reference subject for the Posting Coordinator (ADR-0001). Real financial
 *  documents (invoice/payment) arrive in Phase 3 with the same participant set. */
@Injectable()
export class SampleDocumentService {
  constructor(private readonly uow: UnitOfWork) {}

  post(
    principal: { userId: string; tenantId: string; displayName: string },
    dto: PostSampleDocument,
  ): Promise<{ id: string; code: string; totalAmount: string }> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      // participants: document, audit, outbox — one transaction
      const res = await ctx.query<{ id: string }>(
        `INSERT INTO sample_document (tenant_id, code, total_amount, status)
         VALUES ($1, $2, $3, 'posted') RETURNING id`,
        [ctx.tenantId, dto.code, dto.totalAmount],
      );
      const id = res.rows[0]!.id;
      await ctx.audit.record({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'document.posted',
        entityType: 'sample_document',
        entityId: id,
        details: { code: dto.code, totalAmount: dto.totalAmount },
      });
      await ctx.outbox.emit('SampleDocumentPosted', {
        documentId: id,
        code: dto.code,
        totalAmount: dto.totalAmount,
      });
      if (dto.simulateFailureAfterWrites) {
        throw new Error('injected failure after partial writes (coordinator atomicity demo)');
      }
      return { id, code: dto.code, totalAmount: dto.totalAmount };
    });
  }
}
