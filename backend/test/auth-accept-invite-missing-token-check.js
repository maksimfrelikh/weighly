// BUG-REG-046 — accept-invite returns 404 (NotFoundException) for unknown tokens
// (changed from 400 to satisfy: cancelled invite cannot be accepted → 404).

const assert = require('node:assert/strict');
const { NotFoundException } = require('@nestjs/common');
const { AuthService } = require('../dist/auth/auth.service');

function configService(nodeEnv = 'test') {
  return {
    getOrThrow() {
      return {
        nodeEnv,
        sessionCookieName: 'scale_admin_session',
        csrfCookieName: 'scale_admin_csrf',
        csrfHeaderName: 'x-csrf-token',
        sessionIdleTimeoutMinutes: 30,
        sessionAbsoluteTimeoutDays: 7,
        passwordResetTokenTtlMinutes: 15,
        authFailedLoginMaxAttempts: 5,
        authFailedLoginLockMinutes: 10,
      };
    },
  };
}

function buildService() {
  const prisma = {
    userInvite: {
      findUnique: async () => null,
    },
    user: { findFirst: async () => null },
  };
  const auditLogs = { create: async () => undefined };
  return new AuthService(prisma, auditLogs, configService());
}

(async () => {
  const service = buildService();
  let thrown;
  try {
    await service.acceptInvite(
      // password is a placeholder long enough to pass requirePassword (>=8 chars);
      // the test asserts NotFoundException is raised by findUnique returning null, which
      // is reached after password validation.
      { token: 'definitely-not-a-real-token-1234567890', password: 'placeholder-pw', fullName: 'Cancelled User' },
      { ipAddress: '127.0.0.1', userAgent: 'jest-test' },
    );
  } catch (err) {
    thrown = err;
  }

  assert.ok(thrown, 'expected an exception');
  assert.ok(
    thrown instanceof NotFoundException,
    `expected NotFoundException, got ${thrown && thrown.constructor && thrown.constructor.name}: ${thrown && thrown.message}`,
  );
  console.log('  ✓ accept-invite with unknown token → NotFoundException (404)');
  console.log('auth-accept-invite-missing-token-check: OK');
})().catch((err) => {
  console.error('auth-accept-invite-missing-token-check: FAIL');
  console.error(err);
  process.exit(1);
});
