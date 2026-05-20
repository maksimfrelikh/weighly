# BUG-REG-055 — `deploy-staging.sh` missing `BUILD_SHA` / `BUILT_AT` injection parity with prod

**Status:** OPEN — Wave 5 closure side finding
**Severity:** medium (recurrence pattern — Wave 4 + Wave 5 closure verifies both bit by the same gap)
**Area:** infra / deploy scripts
**Origin:** Wave 5 closure regression — SUMMARY side finding #1 (`docs/regression/2026-05-20-wave-5/SUMMARY.md` lines 131-139). Maksim's call (2026-05-20 ~12:05 GMT+2): "hold deploy-staging BUILD_SHA gap для batch — include в Wave 5 SUMMARY side findings list. Не отдельный stub сейчас. GO." — converted to a stub here after Wave 5 closure approval.

## Scope (from SUMMARY side finding #1, verbatim)

> `deploy-staging.sh` missing `BUILD_SHA` / `BUILT_AT` injection — carry-over from Block 1 of the previous Manager run. Production has `scripts/deploy-prod.sh` injecting these as Docker build args; the staging-deploy path still relies on manual `export BUILD_SHA=…` before restage (which is why the previous Manager's restage caught the live pre-BUG-REG-048 image at all — the gate fired on a mismatch, not on a missing field). Recommend `scripts/deploy-staging.sh` mirror the production injection so staging restages are symmetric and automatic.

## Why this matters

Two consecutive closure verifies (Wave 4 2026-05-19, Wave 5 2026-05-20) tripped on staging serving a stale image while `main` already carried the fix. [[BUG-REG-047]] (`/api/version` endpoint) was merged in Wave 5 specifically to **detect** the gap — and on Wave 5 closure it did detect it, forcing a re-dispatch after a clean restage. But detection is a band-aid; the gap remains in the automation.

## Discovery checklist (for actioning agent)

1. Read `scripts/deploy-prod.sh` to capture the canonical `BUILD_SHA` / `BUILT_AT` injection mechanism (Docker build args → env vars consumed by `/api/version`).
2. Read `scripts/deploy-staging.sh` (or whatever the canonical staging deploy entry-point is) and identify the gap.
3. Mirror the prod injection in the staging script:
   - `BUILD_SHA=$(git rev-parse --short HEAD)`
   - `BUILT_AT=$(date -u +%FT%TZ)`
   - Pass as `--build-arg BUILD_SHA=…` to `docker compose build` (and propagate into the runtime env the version endpoint reads from).
4. Verify a clean restage with no manual `export` populates the version endpoint correctly.

## Acceptance criteria

- [ ] `scripts/deploy-staging.sh` injects `BUILD_SHA` and `BUILT_AT` automatically (no operator pre-export step required).
- [ ] After a fresh `./scripts/deploy-staging.sh` run, `GET https://staging.maksimfrelikh.ru/api/version` returns the actual short-SHA of the deployed commit and a `builtAt` within the deploy window.
- [ ] Staging and prod deploy scripts use a shared injection helper (or are clearly symmetric) so future changes stay aligned.

## Out of scope

- Replacing the deploy scripts with a CI-driven pipeline ([[BUG-REG-051]] / [[BUG-REG-052]] already cover that arc). This ticket is the minimal staging/prod parity fix in the existing script-based world.

## Wave placement

Backlog — recommend front-of-queue given recurrence pattern.

## Cross-references

- [[BUG-REG-047]] — version endpoint, detection layer for this gap (already merged).
- [[BUG-REG-052]] — production deploy automation (eventual replacement; not blocked by this).
- Wave 5 closure SUMMARY side finding #1.
- Wave 4 closure 2026-05-19 — same deploy-pipeline-gap mechanism (`MEMORY.md` Wave 4 closure entry).
