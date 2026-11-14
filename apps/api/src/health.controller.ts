import { Controller, Get } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from './db/unit-of-work.js';
import { Public } from './auth/public.decorator.js';

/**
 * Deployed release identity (staging-runbook V1): the deploy script sets
 * IDEPOT_DEPLOY_SHA from the release tarball's pinned commit. Reported here
 * WITHOUT any secret so `curl /api/health` proves which release is live.
 * Unknown in dev → 'dev' (never a guess).
 */
const DEPLOY_SHA = /^[0-9a-f]{7,40}$/.test(process.env.IDEPOT_DEPLOY_SHA ?? '')
  ? (process.env.IDEPOT_DEPLOY_SHA as string)
  : 'dev';

@Controller('health')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Public()
  @Get()
  async health(): Promise<{ status: string; database: string; sha: string; uptimeSeconds: number }> {
    const uptimeSeconds = Math.floor(process.uptime());
    try {
      await this.pool.query('SELECT 1');
      return { status: 'ok', database: 'up', sha: DEPLOY_SHA, uptimeSeconds };
    } catch {
      return { status: 'ok', database: 'down', sha: DEPLOY_SHA, uptimeSeconds };
    }
  }
}
