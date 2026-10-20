// server/src/admin/password.ts
import { hash, verify } from '@node-rs/argon2';

// @node-rs/argon2 defaults to argon2id. Prebuilt binaries cover linux x64 and
// arm64 glibc, so node:20-slim needs no build tools.
export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(stored: string, candidate: string): Promise<boolean> {
  try {
    return await verify(stored, candidate);
  } catch {
    return false;
  }
}
