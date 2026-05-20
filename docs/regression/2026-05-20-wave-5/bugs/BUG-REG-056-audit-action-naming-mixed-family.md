# BUG-REG-056 — Audit-action naming mixed family (`user.invite.cancelled` vs `user_invite.*`)

**Status:** OPEN — Wave 5 closure side finding
**Severity:** low (cleanup, not a functional defect)
**Area:** backend (audit-log action vocabulary)
**Origin:** Wave 5 closure regression — SUMMARY side finding #2 (`docs/regression/2026-05-20-wave-5/SUMMARY.md` lines 141-146).

## Scope (from SUMMARY side finding #2, verbatim)

> Audit-action naming mixed family. BUG-REG-046 introduced `user.invite.cancelled` (dot-prefix per PRD verbatim). Existing invite audit actions use the snake-prefix family: `user_invite.created` / `user_invite.accepted`. PRD wording was binding so the new action followed it; normalization to a single prefix is a safe cleanup. Suggest a follow-up cleanup ticket.

## Why this matters

Audit-log action strings are increasingly used as filter keys in `/api/logs/global` and the admin UI. A mixed family (`user.invite.cancelled` alongside `user_invite.created` / `user_invite.accepted`) makes filter queries error-prone and breaks any "all invite actions" prefix-match.

## Discovery checklist (for actioning agent)

1. Enumerate every emitted audit `action` value across the backend — at minimum:
   - `users.service.ts` (invite create / accept / cancel)
   - any other service that calls `audit-log.service` / `AuditLogService.write`
2. Pick the canonical prefix family. Two safe choices:
   - **(A) Snake-prefix family** (`user_invite.cancelled`, matches existing `user_invite.created` / `user_invite.accepted`) — minimal churn, only the new `user.invite.cancelled` string flips.
   - **(B) Dot-prefix family** (`user.invite.cancelled`, `user.invite.created`, `user.invite.accepted`) — matches the PRD literal but rewrites two existing actions plus any historical filter consumers.
3. **Recommended:** (A). PRD literal for cancel was binding for the implementation timeline (Wave 5 brief), but a no-op normalization that keeps the wire format consistent is reasonable cleanup — confirm with Maksim before flipping.
4. Mind backward compatibility: existing AuditLog rows have the current strings. The fix is forward-only (new rows use the canonical family); historical rows remain as-is or get a one-shot data migration if cleanup is desired.

## Acceptance criteria

- [ ] All new invite-related audit events use one consistent prefix family across create / accept / cancel.
- [ ] Decision logged in this stub (or in `docs/dev-tasks/`) before the rename lands — PRD literal vs cleanup needs Maksim's sign-off.
- [ ] If a data migration runs over historical rows, it's reversible and dry-run-tested on staging first.

## Out of scope

- Renaming actions in unrelated families (`auth.*`, `stores.*`, etc.) — separate concerns unless they exhibit the same mixed-prefix issue.
- Filter UX changes in the admin Logs page (`logs.service.ts:133-143` envelope is unchanged regardless).

## Wave placement

Backlog.

## Cross-references

- [[BUG-REG-046]] — introduced `user.invite.cancelled` per PRD literal.
- Wave 5 closure SUMMARY side finding #2.
