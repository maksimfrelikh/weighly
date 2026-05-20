# Wave 5 — 2026-05-20

## Dispatch source

Maksim Telegram dispatch 2026-05-20 09:48 GMT+2 (parts 1/2 + 2/2).
Bug sources: `docs/regression/2026-05-19-wave-4-closure/bugs/`.
Regression evidence destination: `docs/regression/2026-05-20-wave-5/` (created on Wave closure).

## Production baseline

`main @ 690a4ff` (pre-Wave-5 tip). Deploy ritual after each merge: `./scripts/deploy-prod.sh deploy` — manual trigger by Maxim. No auto-deploys.

## Execution model

- Sequential chain per Lead AGENTS §3.5 + Lead HEARTBEAT §11.
- After each task merge → auto-dispatch next per autonomous authority from dispatch brief.
- Pre-merge approval each PR — escalate Maxim per HEARTBEAT §8 template.
- Wave closure after 4 merges: full regression on staging → SUMMARY.md in `docs/regression/2026-05-20-wave-5/` → HB Wave 5 complete → Maxim triggers prod deploy.

## Scope (priority-ordered)

### TASK 1 — BUG-REG-044 — `qa-admin@example.com` seed

- **Severity:** low
- **Stack:** backend-only
- **§4.4 verify:** N/A acceptable
- **Source:** `docs/regression/2026-05-19-wave-4-closure/bugs/BUG-REG-044-qa-admin-staging-unseeded.md`
- **PRD interpretations (BINDING from dispatch):**
  - Add `qa-admin@example.com` to `backend/prisma/seed.js`
  - `NODE_ENV` guard: skip seeding qa-admin in production
  - Password: read from `QA_ADMIN_PASSWORD` env var, documented default for local
  - Role: admin
  - Idempotent (re-running seed does not create duplicate)
- **DECISION AUTHORITY (autonomous):**
  - Env var naming, default password value
  - Exact placement in `seed.js`
  - Migration safety check
- **ESCALATE:** pre-merge; schema migration if required.

### TASK 2 — BUG-REG-047 — `/api/version` endpoint

- **Severity:** low
- **Stack:** backend-only
- **§4.4 verify:** N/A acceptable (smoke ok)
- **Source:** `docs/regression/2026-05-19-wave-4-closure/bugs/BUG-REG-047-api-version-endpoint-missing.md`
- **PRD interpretations (BINDING from dispatch):**
  - `GET /api/version`, no auth required (analog of `/api/health`)
  - Response: `{ commit, builtAt, version (from package.json), environment }`
  - Build-time injection via Docker ARG → env var → endpoint reads at boot
  - Dev mode fallback: `"dev"` placeholder
- **DECISION AUTHORITY (autonomous):**
  - Build-time injection mechanism (Docker ARG / build script / git command)
  - Module placement (extend health module or new module)
  - Exact env var naming
- **ESCALATE:** pre-merge; if Docker / deploy scripts require changes.

### TASK 3 — BUG-REG-046 — invite DELETE endpoint + UI

- **Severity:** medium
- **Stack:** backend + frontend (cross-stack)
- **§4.4 verify:** MANDATORY (cross-stack + medium severity per AGENTS §4.4)
- **Source:** `docs/regression/2026-05-19-wave-4-closure/bugs/BUG-REG-046-invite-delete-endpoint-missing.md`
- **PRD interpretations (BINDING from dispatch):**
  - `DELETE /api/users/invites/:inviteId`, admin role only
  - Hard delete OR soft revoke — autonomous call in discovery based on model
  - AuditLog `action: 'user.invite.cancelled'` with metadata `{ inviteId, targetEmail, cancelledByUserId }`
  - FE: cancel button in admin Users & Access page
  - Confirmation dialog before delete
- **§4.4 acceptance:**
  - Admin can cancel → 200, invite gone
  - Operator → 403
  - Cancelled invite cannot be accepted (token returns 410/404)
  - AuditLog entry created
- **DECISION AUTHORITY (autonomous):**
  - DELETE vs PATCH-with-status (existing patterns)
  - UI placement, confirmation copy
  - Hard vs soft delete
- **ESCALATE:** pre-merge; schema migration if soft delete chosen.

### TASK 4 — BUG-REG-048 — cross-cutting pagination

- **Severity:** medium
- **Stack:** backend + frontend (cross-stack)
- **§4.4 verify:** MANDATORY (cross-stack + medium severity per AGENTS §4.4)
- **Source:** `docs/regression/2026-05-19-wave-4-closure/bugs/BUG-REG-048-cross-cutting-pagination.md` (full scope + discovery checklist + proposed envelope)
- **PRD interpretations (BINDING from dispatch):**
  - Envelope: `{ data, meta: { total, limit, offset } }`
  - Default limit 50, max 200 across surfaces
  - Apply to: AuditLog, ScaleSyncLog, Banner, Product, Price (verify exact list in discovery)
  - FE: shared `<Pagination/>` (Prev/Next + "N–M of T" + page-size)
  - Backward compat: old `?limit=N` without offset works (offset defaults 0)
- **§4.4 acceptance:**
  - Each paginated surface returns envelope
  - FE pagination component works
  - Large dataset (>50 items) navigation
  - Permission boundary unchanged (operator scope filter)
- **DECISION AUTHORITY (autonomous):**
  - Exact key names (data/items, meta/pagination)
  - Sort default per surface (createdAt desc typical)
  - Pagination component library choice
  - Surface scope in discovery (flag additional endpoints found)
- **ESCALATE:** pre-merge each PR; scope expansion beyond 5 surfaces.

## Status

- TASK 1 (BUG-REG-044): pending dispatch
- TASK 2 (BUG-REG-047): queued (auto-dispatch on TASK 1 merge)
- TASK 3 (BUG-REG-046): queued (auto-dispatch on TASK 2 merge)
- TASK 4 (BUG-REG-048): queued (auto-dispatch on TASK 3 merge)

## Wave regression scope (post-merge, full staging pass before SUMMARY.md)

- **BUG-REG-044** — backend seed: staging fixtures verify (qa-admin@example.com present + login works on staging, absent on production-mode build).
- **BUG-REG-047** — backend health surface: smoke `/api/version` on staging + verify payload shape matches contract; confirm deployed build SHA matches `git rev-parse HEAD` on the branch.
- **BUG-REG-046** — backend invites + frontend admin Users & Access page: §4.4 acceptance (admin cancel → 200, operator 403, accepted token blocked, AuditLog row) re-run on staging post-merge.
- **BUG-REG-048** — cross-cutting backend pagination + frontend shared `<Pagination/>`: each in-scope surface (logs, banners, products, prices, AuditLog/ScaleSyncLog) returns envelope on staging; FE page-nav navigates large dataset; operator-scope filter preserved.

## Production deploy

After SUMMARY.md + HB Wave 5 complete → Maxim triggers `./scripts/deploy-prod.sh deploy` manually. Lead reminds via post-merge HB; never auto-runs deploy.

## Cross-references

- Lead self-merge authority for this plan: SOUL §13 (docs path).
- Chained dispatch protocol: AGENTS §3.5 + HEARTBEAT §11.
- Pre-merge approval template: HEARTBEAT §8.
- Autonomous authority discipline: SOUL §14.
