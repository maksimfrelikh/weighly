import { Hono } from 'hono';
import { PrismaD1 } from '@prisma/adapter-d1';
import { PrismaClient } from './generated/prisma/client';
import {
  hashPassword,
  verifyPassword,
  BACKEND_ITERATIONS,
  POC_ITERATIONS,
  type PasswordHashParams,
} from './password';

export interface Env {
  DB: D1Database;
}

// New Prisma client per request — the recommended pattern on Workers (isolate-per-request).
function getPrisma(env: Env): PrismaClient {
  const adapter = new PrismaD1(env.DB);
  return new PrismaClient({ adapter });
}

const app = new Hono<{ Bindings: Env }>();

app.get('/poc/health', (c) =>
  c.json({ ok: true, runtime: 'workers', backendIterations: BACKEND_ITERATIONS, pocIterations: POC_ITERATIONS }),
);

// --- Item 1: PBKDF2 hash/verify with timing -------------------------------------------------
app.post('/poc/register', async (c) => {
  const { email, password } = await c.req.json().catch(() => ({}));
  if (!email || !password) return c.json({ error: 'email and password required' }, 400);
  const prisma = getPrisma(c.env);
  const h = await hashPassword(password);
  try {
    const user = await prisma.pocUser.create({
      data: { email, passwordHash: h.passwordHash, passwordHashParams: h.passwordHashParams },
    });
    return c.json({ userId: user.id, hashTimingMs: round(h.timingMs) });
  } catch (e) {
    return c.json({ error: errMsg(e), code: errCode(e) }, 400);
  }
});

app.post('/poc/login', async (c) => {
  const { email, password } = await c.req.json().catch(() => ({}));
  if (!email || !password) return c.json({ error: 'email and password required' }, 400);
  const prisma = getPrisma(c.env);
  const user = await prisma.pocUser.findUnique({ where: { email } });
  if (!user) return c.json({ ok: false, error: 'user not found' }, 404);
  const v = await verifyPassword(password, {
    passwordHash: user.passwordHash,
    passwordHashParams: user.passwordHashParams as unknown as PasswordHashParams,
  });
  return c.json({ ok: v.ok, verifyTimingMs: round(v.timingMs) });
});

// Bonus diagnostic for item 1: repeated runs -> min/median/mean for a given iteration count.
app.get('/poc/timing', async (c) => {
  const iterations = clampInt(c.req.query('iterations'), POC_ITERATIONS, 1, 5_000_000);
  const runs = clampInt(c.req.query('runs'), 5, 1, 50);
  const hashMs: number[] = [];
  const verifyMs: number[] = [];
  for (let i = 0; i < runs; i++) {
    const h = await hashPassword('correct horse battery staple', iterations);
    hashMs.push(h.timingMs);
    const v = await verifyPassword('correct horse battery staple', {
      passwordHash: h.passwordHash,
      passwordHashParams: h.passwordHashParams,
    });
    verifyMs.push(v.timingMs);
  }
  const hs = stats(hashMs);
  const vs = stats(verifyMs);
  return c.json({
    iterations,
    runs,
    hashMs: hs,
    verifyMs: vs,
    roundtripMedianMs: round(hs.median + vs.median),
  });
});

// --- Item 2: basic CRUD through Prisma D1 adapter -------------------------------------------
app.post('/poc/stores', async (c) => {
  const { code, name } = await c.req.json().catch(() => ({}));
  if (!code || !name) return c.json({ error: 'code and name required' }, 400);
  const prisma = getPrisma(c.env);
  try {
    const store = await prisma.pocStore.create({ data: { code, name } });
    return c.json(store);
  } catch (e) {
    return c.json({ error: errMsg(e), code: errCode(e) }, 400);
  }
});

app.post('/poc/categories', async (c) => {
  const { storeId, parentId, name } = await c.req.json().catch(() => ({}));
  if (!storeId || !name) return c.json({ error: 'storeId and name required' }, 400);
  const prisma = getPrisma(c.env);
  try {
    const cat = await prisma.pocCategory.create({
      data: { storeId, parentId: parentId ?? null, name },
    });
    return c.json(cat);
  } catch (e) {
    return c.json({ error: errMsg(e), code: errCode(e) }, 400);
  }
});

// --- Item 4: JSON column round-trip ---------------------------------------------------------
app.get('/poc/json-test', async (c) => {
  const prisma = getPrisma(c.env);
  const original = {
    algorithm: 'pbkdf2_sha512',
    iterations: 210_000,
    saltBase64: btoa('sixteen-byte-salt'),
    keyLength: 64,
    nested: { rounds: [1, 2, 3], strict: true, ratio: 0.5 },
  };
  const created = await prisma.pocUser.create({
    data: {
      email: `json-test-${crypto.randomUUID()}@poc.local`,
      passwordHash: 'placeholder',
      passwordHashParams: original,
    },
  });
  const read = await prisma.pocUser.findUnique({ where: { id: created.id } });
  const roundtrip = read?.passwordHashParams as Record<string, unknown> | undefined;
  const nested = roundtrip?.nested as Record<string, unknown> | undefined;
  const checks = {
    deepEqual: JSON.stringify(roundtrip) === JSON.stringify(original),
    iterationsIsNumber: typeof roundtrip?.iterations === 'number',
    keyLengthIsNumber: typeof roundtrip?.keyLength === 'number',
    ratioIsNumber: typeof nested?.ratio === 'number',
    arrayPreserved: Array.isArray(nested?.rounds),
    boolPreserved: typeof nested?.strict === 'boolean',
  };
  return c.json({ original, roundtrip, checks, pass: Object.values(checks).every(Boolean) });
});

// --- Item 3: composite FK enforcement (scenarios A/B/C through Prisma) -----------------------
app.get('/poc/fk-test', async (c) => {
  const prisma = getPrisma(c.env);
  const tag = crypto.randomUUID().slice(0, 8);

  // Two distinct stores + one real parent category in store 1.
  const store1 = await prisma.pocStore.create({ data: { code: `s1-${tag}`, name: 'Store 1' } });
  const store2 = await prisma.pocStore.create({ data: { code: `s2-${tag}`, name: 'Store 2' } });
  const parentInStore1 = await prisma.pocCategory.create({
    data: { storeId: store1.id, parentId: null, name: 'root-s1' },
  });
  const someCatInStore2 = await prisma.pocCategory.create({
    data: { storeId: store2.id, parentId: null, name: 'root-s2' },
  });

  // Scenario A: valid parent in same store -> expect SUCCESS.
  const a = await attempt(() =>
    prisma.pocCategory.create({
      data: { storeId: store1.id, parentId: parentInStore1.id, name: 'child-valid' },
    }),
  );
  // Scenario B: parentId that does not exist anywhere -> expect FK VIOLATION.
  const b = await attempt(() =>
    prisma.pocCategory.create({
      data: { storeId: store1.id, parentId: crypto.randomUUID(), name: 'child-missing-parent' },
    }),
  );
  // Scenario C: parentId belongs to a DIFFERENT store -> expect FK VIOLATION (cross-tenant).
  const cRes = await attempt(() =>
    prisma.pocCategory.create({
      data: { storeId: store1.id, parentId: someCatInStore2.id, name: 'child-cross-store' },
    }),
  );

  const scenarioA = { expected: 'success', succeeded: a.ok, error: a.error, pass: a.ok === true };
  const scenarioB = { expected: 'fk-violation', succeeded: b.ok, error: b.error, pass: b.ok === false };
  const scenarioC = { expected: 'fk-violation', succeeded: cRes.ok, error: cRes.error, pass: cRes.ok === false };

  return c.json({
    pass: scenarioA.pass && scenarioB.pass && scenarioC.pass,
    scenarioA,
    scenarioB,
    scenarioC,
  });
});

// --- helpers --------------------------------------------------------------------------------
async function attempt(fn: () => Promise<unknown>): Promise<{ ok: boolean; error: string | null; code: string | null }> {
  try {
    await fn();
    return { ok: true, error: null, code: null };
  } catch (e) {
    return { ok: false, error: errMsg(e), code: errCode(e) };
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
function errCode(e: unknown): string | null {
  const code = (e as { code?: unknown })?.code;
  return typeof code === 'string' ? code : null;
}
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
function stats(arr: number[]): { min: number; median: number; mean: number; max: number } {
  const s = [...arr].sort((a, b) => a - b);
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return { min: round(s[0]), median: round(s[(s.length - 1) >> 1]), mean: round(mean), max: round(s[s.length - 1]) };
}

export default app;
