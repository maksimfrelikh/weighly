# BUG-REG-044 — `qa-admin@example.com` not seeded on staging

**Status:** OPEN — backlog
**Severity:** low
**Area:** backend / seed / staging fixtures
**Found during:** Wave 4 closure verify (2026-05-19) — side finding #1 in `docs/regression/2026-05-19-wave-4-closure/SUMMARY.md`.

## Steps to reproduce

1. `./scripts/deploy-staging.sh reset` (or rebuild staging stack from a clean DB).
2. Query the users table on the staging Postgres container.
3. `qa-admin@example.com` is absent. Only `admin@example.com / admin12345` is present (created by `prisma/seed.js`).

## Expected

Seed creates `qa-admin@example.com` with a known password so Tester/Manager verify scripts can authenticate as the canonical QA admin without falling back to the dev `admin@example.com` account.

## Actual

- `prisma/seed.js` only inserts `admin@example.com`.
- Wave 4 closure verify used `admin@example.com / admin12345` per the brief-allowed fallback. Manager AGENTS.md §2 still references `qa-admin@example.com` as the canonical staging admin.

## Hypothesis paths (for the eventual fix)

- **(a) Add `qa-admin@example.com` to `prisma/seed.js`** with a known password, gated by `SEED_ON_STARTUP=true` (already wired in BUG-REG-038 staging compose).
- **(b) Separate `prisma/qa-seed.js`** that only runs on staging — keeps prod seed minimal and isolates QA fixtures.
- **(c) Document the workaround in Manager AGENTS.md §2** — i.e. drop the `qa-admin@example.com` reference and switch the canonical staging admin to `admin@example.com`.

## Out of scope

- Production seed. This is a staging-only fixture; the live prod DB must not gain a QA account.
- Multi-role fixture seeding (operator, viewer) — separate ticket if/when it becomes useful.

## Wave placement

Backlog. Bundle with the next staging-fixtures cleanup pass, or pick up when the Manager AGENTS.md §2 update lands ([[BUG-REG-045]]).
