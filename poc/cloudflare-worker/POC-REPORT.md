# Phase 0 PoC — Cloudflare Workers + D1 + Hono + Prisma + WebCrypto

**Date:** 2026-05-27 · **Branch:** `poc/cloudflare-workers` · **Scope:** throwaway validation of the migration stack. Not production. `backend/` and `frontend/` untouched.

---

## Verdict (TL;DR)

**The stack is viable. Proceed — with one explicit decision required on password-hash cost.**

| # | Risk item | Result | Notes |
|---|-----------|--------|-------|
| 1 | WebCrypto PBKDF2 timing | ✅ works / ⚠️ **decision needed** | Runtime is fine. Matching the backend's 210k iterations costs **~242ms** per hash+verify roundtrip (warm) — ~24× over the 10ms target. Fitting "well under 10ms" needs ~5k iterations = **42× weaker**. See §1. |
| 2 | Prisma D1 adapter + composite FK | ✅ **PASS** | Prisma 7 schema (incl. composite self-FK) validates, migration applies to D1, CRUD roundtrips. Several Prisma 7 breaking changes hit along the way — all resolved, documented in §5. |
| 3 | D1 composite FK enforcement | ✅ **PASS** | All 3 scenarios behave like Postgres, incl. cross-store rejection. Confirmed at the DB level (raw `SQLITE_CONSTRAINT_FOREIGNKEY`), not Prisma emulation. See §3. |
| 4 | JSON column round-trip | ✅ **PASS** | `Json` → `JSONB` on D1; deep-equal preserved, numbers stay numbers. See §4. |

**No hard blocker.** The only thing standing between this and "green light" is a product/security call on item 1 (how much CPU per login you're willing to spend on Workers).

---

## Stack (resolved versions)

| Package | Version |
|---|---|
| `prisma` / `@prisma/client` / `@prisma/adapter-d1` | **7.8.0** |
| `hono` | 4.12.23 |
| `wrangler` | 4.95.0 |
| `@cloudflare/workers-types` | 4.20260527.1 |
| `typescript` | 5.9.3 |
| Node (build host) | 24.15.0 |

Prisma 7 ships **without the Rust query engine** — it uses a WASM query compiler + driver adapters (now GA). That is *good news* for this migration: the Rust engine never ran on Workers anyway, so driver-adapters were always the only path. `tsc --noEmit` passes clean.

---

## 1. WebCrypto PBKDF2 timing — works, but 210k is expensive on Workers

Implemented in `src/password.ts` using **`crypto.subtle.deriveBits`** (Web Crypto), **not** `node:crypto`. Parameters replicated exactly from `backend/src/auth/password.util.ts`:

| Param | Backend value | Replicated |
|---|---|---|
| Algorithm | `pbkdf2_sha512` | ✅ |
| Iterations | **210,000** | ✅ (`BACKEND_ITERATIONS`) |
| Key length | 64 bytes (512-bit) | ✅ |
| Salt | 32 random bytes | ✅ `crypto.getRandomValues` |
| Digest | SHA-512 | ✅ |
| Encoding | base64 | ✅ |

> Note: the brief's example said `iterations: 310000`. The **actual** backend value is **210,000** (OWASP-aligned). The PoC replicates the real value.

Hash and verify work correctly: correct password → `ok:true`, wrong password → `ok:false`. Verify uses a constant-time comparison (WebCrypto has no `timingSafeEqual`).

### Measured timing (`wrangler dev --local`)

Cold first call: hash **215ms**, verify **142ms** (JIT warmup). Warm steady-state, 8-run medians via `GET /poc/timing`:

| Iterations | Hash (median) | Verify (median) | **Roundtrip** | vs 10ms target |
|---:|---:|---:|---:|---|
| **210,000** (backend) | 120ms | 122ms | **242ms** | ❌ 24× over |
| 100,000 | 57ms | 57ms | 114ms | ❌ |
| 50,000 | 29ms | 29ms | 58ms | ❌ |
| 25,000 | 14ms | 15ms | 29ms | ❌ |
| 10,000 | 6ms | 6ms | 12ms | ~at limit |
| **5,000** | 3ms | 3ms | **6ms** | ✅ fits |
| 2,000 | 1ms | 1ms | 2ms | ✅ |

Cost is linear (~0.58µs/iteration warm). The PoC's live endpoints are set to **`POC_ITERATIONS = 5_000`** so they demonstrably pass the 10ms budget (register measured 7ms, login 5ms).

### ⚠️ The decision — do NOT just ship 5k

Lowering 210k → 5k to satisfy a 10ms budget is a **42× reduction in brute-force cost**. Password hashing is *supposed* to be slow; that's the security. The 10ms figure is essentially the **Workers free-tier per-request CPU cap** — an infra artifact, not a security target.

**Recommendation:**
1. **Keep iterations at ~210k** (or re-tune to current OWASP guidance) and run on a **Workers paid plan**, where the CPU limit is configurable far above 10ms (set `limits.cpu_ms` in `wrangler.toml`). 242ms CPU per login is perfectly acceptable for an admin panel. This is the cheap, correct path.
2. If a hard sub-10ms edge budget is genuinely required, the answer is **not a weaker KDF** — it's keeping password verification off the hot edge path (e.g. a dedicated auth service / Durable Object / queue), which is a design change beyond this stack-validation PoC.

**Bottom line:** the runtime is fully capable; this is a CPU-budget choice, not a technical blocker.

---

## 2. Prisma D1 adapter + composite FK — works end to end

- **Schema** (`prisma/schema.prisma`): `PocUser`, `PocStore`, `PocCategory` with `@@unique([storeId, id])` and the composite self-FK `[storeId, parentId] → [storeId, id]`. **`prisma validate` passes** — Prisma 7 accepts a scalar (`storeId`) shared across two relations (the plain store FK and the composite parent FK).
- **Migration**: `prisma migrate diff --from-empty --to-schema --script` emits correct SQLite DDL (composite `FOREIGN KEY (...) REFERENCES PocCategory (storeId, id)` + backing unique index). Applied to local D1 via `wrangler d1 migrations apply DB --local` → 7 commands OK. SQL committed at `migrations/0001_init.sql`.
- **CRUD**: register/login (PocUser), `POST /poc/stores`, `POST /poc/categories` all roundtrip through the `@prisma/adapter-d1` driver adapter against local D1. Client instantiated per-request (the recommended Workers pattern).

No pivot to Drizzle / raw SQL needed — **Prisma 7 + D1 works**. (Some Prisma 7 friction along the way; see §5.)

---

## 3. D1 composite FK enforcement — enforced exactly like Postgres

`GET /poc/fk-test` runs all three scenarios through Prisma:

| Scenario | Setup | Expected | Result |
|---|---|---|---|
| A | parent in **same** store | success | ✅ created |
| B | parentId that **doesn't exist** | FK violation | ✅ `Foreign key constraint violated` |
| C | parentId from a **different** store | FK violation | ✅ `Foreign key constraint violated` |

Scenario C is the multi-tenant guarantee — a category cannot adopt a parent from another store. **D1 enforces it.**

**Authoritative cross-check** (raw SQL, bypassing Prisma):
- `PRAGMA foreign_keys` → `1` (enforcement ON in local D1).
- Raw `INSERT` of a category with a non-existent composite parent → `FOREIGN KEY constraint failed: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_FOREIGNKEY)`.

So enforcement is genuine database-level behavior, not Prisma simulation. **No STOP condition triggered.**

---

## 4. JSON column round-trip — clean, numbers preserved

`GET /poc/json-test` writes a nested object into `PocUser.passwordHashParams` and reads it back via Prisma:

- `deepEqual: true` (JSON-stringify equality).
- `typeof iterations === 'number'`, `typeof keyLength === 'number'`, `typeof ratio === 'number'` (0.5 stays a float) — **numbers stay numbers, not strings**.
- Arrays preserved (`[1,2,3]`), booleans preserved (`true`).

Note: Prisma 7 maps the `Json` type to a **`JSONB`** column on SQLite. Despite the binary storage format, the adapter serializes/deserializes transparently and the round-trip is lossless. The register→login flow independently confirms this (verify re-reads `passwordHashParams` and succeeds, which only works if `iterations`/`keyLength` survive as numbers).

---

## 5. Prisma 7 migration intel (gotchas hit & resolved)

Worth knowing before the real migration — Prisma 7 is a major release with breaking changes:

1. **`url` is banned in the `datasource` block** (`P1012`). It moves to **`prisma.config.ts`** → `datasource.url`. The schema datasource is now just `{ provider = "sqlite" }`. This URL is **CLI-only** (Migrate shadow DB); the worker connects via the D1 adapter.
2. **`prisma.config.ts` is effectively required for Migrate.** Without a `datasource.url` in it, `prisma migrate diff` **silently emits an empty diff** (exit 0, no output, no error) — a confusing failure mode. Adding the config fixed it instantly.
3. **`--to-schema-datamodel` was removed** → use **`--to-schema`**.
4. **New generator**: `provider = "prisma-client"` (not `prisma-client-js`), with a required `output` path and `runtime = "workerd"`. Generates ESM, no Rust engine.
5. **`.env` is not auto-loaded** by `prisma.config.ts`. The PoC hardcodes the throwaway shadow-DB path in config to avoid the dependency.
6. `wrangler dev` auto-loads `.env` and exposes `DATABASE_URL` to the worker as a binding — harmless here (the worker ignores it), but worth knowing it leaks into the runtime env.

---

## 6. Local-vs-production caveats (read before committing)

This PoC ran **only on local miniflare D1** (`wrangler dev --local`), per the brief — no deploy, no remote D1, no Cloudflare account. Before locking the migration decision, smoke-test on **remote D1** for:

- **FK enforcement**: local miniflare reports `foreign_keys=1` and enforces. Cloudflare's docs say remote D1 enforces FKs too, but confirm the composite-FK behavior remotely once.
- **Timing**: production `workerd` crypto (BoringSSL) may differ from local miniflare. The *curve* (linear in iterations) will hold; the absolute constant may shift. Re-measure on deploy.
- **Timer resolution**: `performance.now()` gave clean ms numbers locally. Deployed Workers coarsen timers (Spectre mitigation), so in-prod per-request timing will be less precise — fine for the decision, not for fine-grained profiling.
- **`JSONB`**: round-trips locally; verify once remotely.

---

## 7. Not tested (out of scope per brief)

CORS · cookies · sessions · CSRF · rate limiting · deploy · real Cloudflare account / API tokens · remote D1 · data migration from the real Postgres schema · CI/CD. None of these were touched.

---

## 8. How to run

```bash
cd poc/cloudflare-worker
npm install
cp .env.example .env                       # CLI-only shadow DB path
npm run generate                           # prisma generate -> src/generated/prisma
npm run migrate:diff > migrations/0001_init.sql   # (already committed)
npm run migrate:apply:local                # wrangler d1 migrations apply DB --local
npm run dev                                 # wrangler dev --local on :8787
```

Endpoints (all under `/poc`): `GET /health`, `POST /register`, `POST /login`, `POST /stores`, `POST /categories`, `GET /fk-test`, `GET /json-test`, `GET /timing?iterations=N&runs=M`.

---

## 9. Recommendation

**Green-light the stack** (Workers + D1 + Hono + Prisma 7 + WebCrypto). Items 2/3/4 pass with no reservations. The single open decision is item 1: **budget the CPU for ~210k PBKDF2 iterations on a paid Workers plan rather than weakening the KDF.** Confirm FK + timing once on remote D1 before committing the full backend rewrite.
