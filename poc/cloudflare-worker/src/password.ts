// PBKDF2-SHA512 via the Web Crypto API (crypto.subtle.deriveBits) — Workers-native, NO node:crypto.
//
// Parameters replicate backend/src/auth/password.util.ts exactly:
//   algorithm "pbkdf2_sha512", iterations 210_000, keyLength 64 bytes,
//   salt 32 random bytes, digest sha512, base64 encoding.
//
// `POC_ITERATIONS` is what the live endpoints use. If the backend's 210k blows the
// Workers CPU budget on `wrangler dev`, lower POC_ITERATIONS and the gap (original vs
// lowered) is documented in POC-REPORT.md. BACKEND_ITERATIONS always records the real value.

export const BACKEND_ITERATIONS = 210_000;
// Lowered to fit the brief's "well under 10ms" budget on `wrangler dev`: at 210k a
// hash+verify roundtrip measured ~242ms (warm), ~24x over budget. 5_000 lands ~6ms.
// ⚠️ This is a 42x reduction in brute-force cost and is NOT a production recommendation.
// See POC-REPORT.md §1 — the realistic answer is to keep ~210k and budget Workers CPU,
// not to weaken the KDF. BACKEND_ITERATIONS above always records the real backend value.
export const POC_ITERATIONS = 5_000;
export const KEY_LENGTH_BYTES = 64; // 512-bit derived key
export const SALT_LENGTH_BYTES = 32;
export const DIGEST = 'SHA-512';
export const ALGORITHM = 'pbkdf2_sha512';

const textEncoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deriveBitsRaw(
  password: string,
  salt: Uint8Array,
  iterations: number,
  keyLengthBytes: number,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: DIGEST },
    keyMaterial,
    keyLengthBytes * 8,
  );
  return new Uint8Array(bits);
}

export type PasswordHashParams = {
  algorithm: string;
  salt: string;
  iterations: number;
  keyLength: number;
  digest: string;
  encoding: 'base64';
};

export type HashResult = {
  passwordHash: string;
  passwordHashParams: PasswordHashParams;
  timingMs: number;
};

export async function hashPassword(
  password: string,
  iterations: number = POC_ITERATIONS,
): Promise<HashResult> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const t0 = performance.now();
  const hash = await deriveBitsRaw(password, salt, iterations, KEY_LENGTH_BYTES);
  const timingMs = performance.now() - t0;
  return {
    passwordHash: bytesToBase64(hash),
    passwordHashParams: {
      algorithm: ALGORITHM,
      salt: bytesToBase64(salt),
      iterations,
      keyLength: KEY_LENGTH_BYTES,
      digest: 'sha512',
      encoding: 'base64',
    },
    timingMs,
  };
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export type VerifyResult = { ok: boolean; timingMs: number };

export async function verifyPassword(
  password: string,
  credential: { passwordHash: string; passwordHashParams: PasswordHashParams },
): Promise<VerifyResult> {
  const t0 = performance.now();
  const params = credential.passwordHashParams;
  if (!params || params.algorithm !== ALGORITHM || typeof params.salt !== 'string') {
    return { ok: false, timingMs: performance.now() - t0 };
  }
  const iterations = Number(params.iterations);
  const keyLength = Number(params.keyLength);
  if (!Number.isInteger(iterations) || iterations < 1 || !Number.isInteger(keyLength) || keyLength < 1) {
    return { ok: false, timingMs: performance.now() - t0 };
  }
  const expected = base64ToBytes(credential.passwordHash);
  const actual = await deriveBitsRaw(password, base64ToBytes(params.salt), iterations, keyLength);
  const ok = expected.length === actual.length && constantTimeEqual(expected, actual);
  return { ok, timingMs: performance.now() - t0 };
}
