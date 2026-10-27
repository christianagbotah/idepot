import type { z } from 'zod';

/** Validate a request body against a zod contract; throws ValidationError-shaped error. */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const res = schema.safeParse(body);
  if (!res.success) {
    const err = new Error(
      res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
    err.name = 'ValidationError';
    throw err;
  }
  return res.data;
}
