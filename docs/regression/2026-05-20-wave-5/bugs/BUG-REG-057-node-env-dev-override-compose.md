# BUG-REG-057 — `NODE_ENV=production` is the docker-compose default with no dev-override compose file

**Status:** OPEN — Wave 5 closure side finding
**Severity:** low (workflow ergonomics, not a defect)
**Area:** infra (docker-compose)
**Origin:** Wave 5 closure regression — SUMMARY side finding #3 (`docs/regression/2026-05-20-wave-5/SUMMARY.md` lines 148-153). First flagged by PR #24 Manager during invite-token verification.

## Scope (from SUMMARY side finding #3, verbatim)

> `NODE_ENV=production` is the docker-compose default with no override. PR #24 Manager flagged this — invite-token Item 3 acceptance required briefly flipping to `development` to expose the raw token at create time. A `docker-compose.override.dev.yml` or equivalent dev-mode compose file would make the dev/testing workflow less surgical.

## Why this matters

Several Wave 4 / Wave 5 acceptance items required briefly flipping `NODE_ENV` to `development` to expose dev-mode-only data (raw invite tokens, error stack traces). Each of those flips was surgical and reversible, but the surface area for "forgot to flip back" is non-zero. A dedicated dev-mode compose file makes the contract explicit and the reset trivial.

## Discovery checklist (for actioning agent)

1. Inspect the canonical `docker-compose*.yml` set in the repo root. Identify where `NODE_ENV=production` is set (likely in the backend service env).
2. Add `docker-compose.override.dev.yml` (or follow the existing override pattern if one exists) with:
   - `NODE_ENV=development`
   - Any other dev-mode-only switches that recur in verify workflows (e.g., extended logging, dev-mode token exposure flags).
3. Document the dev-mode invocation in `AGENTS.md` and/or `docs/dev-tasks/` (e.g., `docker compose -f docker-compose.yml -f docker-compose.override.dev.yml up -d --build backend`).
4. Confirm: staging compose (`docker-compose.staging.yml` or similar) is unaffected — `NODE_ENV=production` stays the canonical staging setting.

## Acceptance criteria

- [ ] A dev-mode compose file exists, committed, and is referenced in `AGENTS.md` (or the canonical onboarding doc).
- [ ] The default `docker compose up` still resolves to `NODE_ENV=production` (no behavior change for vanilla invocations).
- [ ] A local-docker verify can be flipped to dev-mode in one command without editing files.

## Out of scope

- Adding an `OPERATOR_SEED_ON_STARTUP` toggle — covered in Wave 5 SUMMARY lessons-learned and tracked separately if Maksim wants a dedicated stub.
- Production / staging compose changes.

## Wave placement

Backlog.

## Cross-references

- [[BUG-REG-046]] (Manager notes from PR #24) — first surfaced the gap.
- Wave 5 closure SUMMARY side finding #3.
