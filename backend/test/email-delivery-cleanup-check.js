const assert = require('node:assert/strict');
const { ServiceUnavailableException } = require('@nestjs/common');
const { AuthService } = require('../dist/auth/auth.service');

function configService(nodeEnv = 'production') {
  return {
    getOrThrow(key) {
      assert.equal(key, 'app');
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
        frontendOrigin: 'https://example.test',
        emailProvider: 'resend',
        emailFrom: 'Scale Admin <invites@maksimfrelikh.ru>',
        emailReplyTo: 'frelikhmax@gmail.com',
        resendApiKey: 're_test_placeholder',
      };
    },
  };
}

async function testInviteCleanupOnDeliveryFailure() {
  const inviteId = '11111111-1111-4111-8111-111111111111';
  let inviteRow = null;
  const prisma = {
    user: {
      findFirst: async () => null,
    },
    userInvite: {
      deleteMany: async ({ where }) => {
        assert.equal(where.id, inviteId);
        assert.equal(where.acceptedAt, null);
        const count = inviteRow ? 1 : 0;
        inviteRow = null;
        return { count };
      },
    },
    $transaction: async (callback) => callback({
      userInvite: {
        create: async ({ data }) => {
          inviteRow = {
            id: inviteId,
            ...data,
            acceptedAt: null,
            createdAt: new Date('2026-05-21T12:00:00.000Z'),
          };
          return inviteRow;
        },
      },
    }),
  };
  const auth = new AuthService(
    prisma,
    { create: async () => undefined },
    configService(),
    {
      sendInviteEmail: async () => {
        throw new Error('mock delivery failure');
      },
    },
  );

  await assert.rejects(
    () => auth.createInvite({
      email: 'operator@example.test',
      role: 'operator',
      expiresAt: '2026-05-28T12:00:00.000Z',
    }, 'actor-id', {}),
    (error) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match(error.message, /Invite email could not be delivered/);
      return true;
    },
  );
  assert.equal(inviteRow, null, 'failed delivery must delete the invite row');
}

async function testPasswordResetCleanupOnDeliveryFailure() {
  const resetTokenId = '22222222-2222-4222-8222-222222222222';
  let resetTokenRow = null;
  const prisma = {
    user: {
      findFirst: async () => ({ id: '33333333-3333-4333-8333-333333333333', email: 'admin@example.test' }),
    },
    passwordResetToken: {
      deleteMany: async ({ where }) => {
        assert.equal(where.id, resetTokenId);
        assert.equal(where.usedAt, null);
        const count = resetTokenRow ? 1 : 0;
        resetTokenRow = null;
        return { count };
      },
    },
    $transaction: async (callback) => callback({
      passwordResetToken: {
        create: async ({ data }) => {
          resetTokenRow = {
            id: resetTokenId,
            ...data,
            usedAt: null,
            createdAt: new Date('2026-05-21T12:00:00.000Z'),
          };
          return resetTokenRow;
        },
      },
    }),
  };
  const auth = new AuthService(
    prisma,
    { create: async () => undefined },
    configService(),
    {
      sendPasswordResetEmail: async () => {
        throw new Error('mock delivery failure');
      },
    },
  );

  await assert.rejects(
    () => auth.requestPasswordReset('admin@example.test', {}),
    (error) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match(error.message, /Password reset email could not be delivered/);
      return true;
    },
  );
  assert.equal(resetTokenRow, null, 'failed delivery must delete the reset token row');
}

(async () => {
  await testInviteCleanupOnDeliveryFailure();
  await testPasswordResetCleanupOnDeliveryFailure();
  console.log('email-delivery-cleanup-check: OK');
})().catch((error) => {
  console.error('email-delivery-cleanup-check: FAIL');
  console.error(error);
  process.exit(1);
});
