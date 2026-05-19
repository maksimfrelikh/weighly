# BUG-REG-037 — CSRF token rotation invalidates other open admin tabs

**Status:** OPEN — Wave 3 backlog
**Severity:** low-medium (UX irritation; recoverable via refresh; no data loss / no data corruption)
**FLAG:** **blocked by cross-tab post-mortem** (depends on 014/017 strategy). Do NOT fix until cross-tab strategy is decided.
**Found during:** BUG-REG-015 Tester verify (2026-05-19), Playwright MODE_A (same-context two-tab) instrumentation.
**Reporter:** Tester subagent runId `03e97bbe-512b-496b-a7a9-160dfe8817b7`.

## Steps to reproduce

1. Log in as admin in Tab A. Wait for dashboard to render and any mutation to succeed (confirms CSRF token is cached in RTK state for Tab A).
2. Open Tab B in the SAME browser context (new tab via Ctrl+T — not a new window, not incognito).
3. Tab B finishes its bootstrap, which includes `GET /api/auth/csrf`. The response rotates the shared `scale_admin_csrf` cookie. RTK-Query in Tab B caches the NEW token.
4. Return to Tab A. Trigger any mutation that requires CSRF (e.g. archive a store, rename a category — any non-GET admin write).
5. Tab A sends the mutation with the OLD CSRF token (still held in RTK state). Backend compares to current cookie value (NEW). Mismatch.

## Expected

One of:
- (a) CSRF rotation triggered by Tab B does NOT invalidate Tab A's cached token; or
- (b) Tab A auto-fetches a fresh CSRF token and retries silently when it gets `403 CSRF_TOKEN_INVALID`; or
- (c) RTK-Query reads CSRF from the cookie at request time rather than caching it in client state.

## Actual

- Backend returns `403 CSRF_TOKEN_INVALID` on the Tab A mutation.
- Frontend surfaces the toast: `"Сессия формы истекла. Обновите страницу и повторите действие."`
- User must hit refresh, losing any in-flight form state. No data corruption, no data loss beyond the unsaved form.

## Hypothesis paths (for the eventual fix — DO NOT implement yet)

- **(a) Re-fetch CSRF before every mutation.** Simple. +1 network request per mutation. Cleanest invariant: every mutation is preceded by a fresh GET.
- **(b) Read CSRF from cookie at request time, not from RTK state.** Single source of truth (the cookie). No client-side caching layer to drift. Requires the request-side baseQuery to inspect `document.cookie` (or a small wrapper) instead of the RTK-cached `csrf` slice.
- **(c) Auto-retry on `403 CSRF_TOKEN_INVALID` with a fresh fetch.** Recovery pattern — best UX, but mixes retry logic with auth concerns; care needed to prevent retry storms.

A combination of (b) + (c) is likely the most robust answer, but the call is deferred to the cross-tab post-mortem.

## Out of scope

- Fixing this bug before the cross-tab post-mortem closes. Strategy for CSRF cross-tab handling must be aligned with the broader BroadcastChannel / multi-tab / storage-event decision pending after the Wave 1 014/017 revert.
- Backend-side CSRF rotation policy changes. The rotation behavior on `GET /api/auth/csrf` is intentional; only the client-side cache invariant is wrong.

## Evidence

- BUG-REG-015 verify SUMMARY: side-finding section in `docs/regression/2026-05-19-BUG-REG-015-verify/SUMMARY.md`.
- Tester runId: `03e97bbe-512b-496b-a7a9-160dfe8817b7` / sessionKey `agent:tester:subagent:da057826-b34d-4e1a-a840-ad82b57b861c`.
- Tester verify branch (test artifacts only, do NOT merge): `verify/BUG-REG-015-stores-cross-tab` at commit `1b4c68a`.
