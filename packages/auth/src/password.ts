/**
 * Argon2id password hashing (OWASP-tuned parameters).
 * Parameter choice: m=64 MiB, t=3, p=4 (memory-first for server use).
 */
import { hash, verify, Algorithm } from '@node-rs/argon2';

const ARGON2ID_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2ID_OPTIONS);
}

export async function verifyPassword(hashStr: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashStr, plain, ARGON2ID_OPTIONS);
  } catch {
    return false;
  }
}
