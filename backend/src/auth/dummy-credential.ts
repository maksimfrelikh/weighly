import { pbkdf2Sync } from 'node:crypto';

// Precomputed dummy credential used on the no-user branch of AuthService.login
// so verifyPassword() runs once on every request regardless of whether the
// submitted email belongs to a real account. Closes BUG-REG-068
// (user-existence enumeration via login response-latency delta).
// Params must mirror production hash params from password.util.ts so the
// pbkdf2 timing matches the existing-user path exactly.
const DUMMY_PASSWORD = 'BUG-REG-068-dummy-credential-throwaway-string';
const DUMMY_SALT = Buffer.alloc(32, 0xa5);
const ITERATIONS = 210_000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';
const ALGORITHM = 'pbkdf2_sha512'; // gitleaks:allow

const DUMMY_HASH = pbkdf2Sync(DUMMY_PASSWORD, DUMMY_SALT, ITERATIONS, KEY_LENGTH, DIGEST);

export const DUMMY_CREDENTIAL = {
  passwordHash: DUMMY_HASH.toString('base64'),
  passwordHashAlgorithm: ALGORITHM,
  passwordHashParams: {
    salt: DUMMY_SALT.toString('base64'),
    iterations: ITERATIONS,
    keyLength: KEY_LENGTH,
    digest: DIGEST,
    encoding: 'base64',
  },
} as const;
