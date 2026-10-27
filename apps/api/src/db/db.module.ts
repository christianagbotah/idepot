import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL, PG_ADMIN_POOL, UnitOfWork } from './unit-of-work.js';

function url(env: string, what: string): string {
  const v = process.env[env];
  if (!v) throw new Error(`${env} must be set (${what})`);
  return v;
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () =>
        new Pool({
          connectionString: url('IDEPOT_DATABASE_URL', 'application role, RLS-subject'),
          max: 10,
        }),
    },
    {
      provide: PG_ADMIN_POOL,
      useFactory: () =>
        new Pool({
          connectionString: url('IDEPOT_DATABASE_ADMIN_URL', 'admin migrations/ops only'),
          max: 2,
        }),
    },
    UnitOfWork,
  ],
  exports: [PG_POOL, PG_ADMIN_POOL, UnitOfWork],
})
export class DbModule {}
