import { Controller, Get } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from './db/unit-of-work.js';
import { Public } from './auth/public.decorator.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Public()
  @Get()
  async health(): Promise<{ status: string; database: string }> {
    try {
      await this.pool.query('SELECT 1');
      return { status: 'ok', database: 'up' };
    } catch {
      return { status: 'ok', database: 'down' };
    }
  }
}
