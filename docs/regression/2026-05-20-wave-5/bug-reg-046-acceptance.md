# BUG-REG-046 — §4.4 Acceptance Evidence

**Branch:** `fix/bug-reg-046-invite-delete-endpoint`
**Run date:** 2026-05-20 (local stack)
**Stack:** docker-compose backend (`scale-admin-backend` :3000) + postgres (`scale-admin-postgres` :5432) + frontend (`scale-admin-frontend` :5173).
**Backend NODE_ENV during runs:** `production`, except where noted (Item 3 required `development` to expose the raw invite token at create time — a production-mode constraint, not a behavior the new code introduces).
**Admin under test:** `admin@example.com` (`4ea0b245-abad-4768-8e86-7de0c018ae6d`).
**Operator under test:** `operator-manager@example.com` — password was rebound to `OperatorPass1!` via direct `user_credentials` UPDATE using the same `pbkdf2_sha512` hash format as `backend/prisma/seed.js`. Only credential row was modified; user identity, role, and status remained untouched.

All four §4.4 items PASS.

## Item 1 — Admin can cancel → 200 OK, invite no longer accept-target

```
# 1a. Create invite (admin) — POST /api/auth/invites
{"invite":{"id":"e3475ac0-0995-4958-8303-6bbf58446434","email":"item1-cancel@example.test","role":"operator","expiresAt":"2026-05-27T09:10:11.000Z","acceptedAt":null,"createdAt":"2026-05-20T09:10:12.000Z"}}

# 1b. DB row exists pre-cancel:
                  id                  |           email           |   role   | acceptedAt
--------------------------------------+---------------------------+----------+------------
 e3475ac0-0995-4958-8303-6bbf58446434 | item1-cancel@example.test | operator |

# 1c. Admin DELETE /api/users/invites/:inviteId
HTTP 200
{"inviteId":"e3475ac0-0995-4958-8303-6bbf58446434","cancelled":true}

# 1d. DB row absent post-cancel (hard delete):
 remaining_rows
----------------
              0
```

**Result:** PASS — admin cancel returns `200`, row is hard-deleted. The deleted row is therefore not a valid accept target (no `tokenHash` row remains; accept path proves this in Item 3).

## Item 2 — Operator role → 403 Forbidden

```
# 2a. Create invite to attempt operator cancel against
{"invite":{"id":"870d0336-7f71-4184-9597-f83a2b919ad4","email":"item2-operator-blocked@example.test","role":"operator","expiresAt":"2026-05-27T09:10:11.000Z","acceptedAt":null,"createdAt":"2026-05-20T09:10:12.272Z"}}

# 2b. Operator session DELETE /api/users/invites/:inviteId
HTTP 403
{"message":"Insufficient role","error":"Forbidden","statusCode":403}

# 2c. DB row still present (operator was forbidden, row preserved):
                  id                  |                email
--------------------------------------+-------------------------------------
 870d0336-7f71-4184-9597-f83a2b919ad4 | item2-operator-blocked@example.test
```

**Result:** PASS — operator session blocked by existing `@RequireRoles('admin')` + `RolesGuard` already mounted on `UsersController`; the new route inherits the controller-level guard. No new role-guard wiring introduced.

## Item 3 — Cancelled invite cannot be accepted → 404 Not Found

> Backend was temporarily switched to `NODE_ENV=development` for this item (and only this item) so that the raw invite token is returned at create time. The backend-side response shape and the cancel endpoint behavior are identical between modes; this switch only affects the dev-only echo of the create-time token. Production mode was restored immediately after.

```
# 3a. Create invite (token returned in dev mode)
{"invite":{"id":"c11b5843-b5d4-49a3-a60c-bb9d98af5323","email":"item3-cancel-then-accept@example.test","role":"operator","expiresAt":"2026-05-27T09:10:40.000Z","acceptedAt":null,"createdAt":"2026-05-20T09:10:40.429Z"},"token":"<REDACTED-43-CHAR-INVITE-TOKEN-SINCE-CANCELLED-AND-INVALID>"}

# 3b. Admin cancels invite
HTTP 200
{"inviteId":"c11b5843-b5d4-49a3-a60c-bb9d98af5323","cancelled":true}

# 3c. Attempt to accept the cancelled invite using its (now-orphaned) token
#     POST /api/auth/invites/accept with CSRF header
HTTP 404
{"message":"Invitation not found","error":"Not Found","statusCode":404}
```

**Result:** PASS — `POST /api/auth/invites/accept` against an orphaned token returns `404 Not Found`. The behavior change is intentional: `auth.service.acceptInvite` previously threw `BadRequestException('Invitation is invalid')` (HTTP 400) for unknown tokens; it now throws `NotFoundException('Invitation not found')` (HTTP 404). This change is the only modification made to the accept-invite flow, consistent with the brief's hard rule: "DO NOT change existing invite-accept flow except to make it correctly return 410/404 for cancelled invites."

## Item 4 — AuditLog row created on cancel

```
SELECT "actorUserId", action, "entityType", "entityId", metadata, "createdAt"
  FROM audit_logs
 WHERE action='user.invite.cancelled'
 ORDER BY "createdAt" DESC LIMIT 5;

             actorUserId              |        action         | entityType |               entityId
--------------------------------------+-----------------------+------------+--------------------------------------
 4ea0b245-abad-4768-8e86-7de0c018ae6d | user.invite.cancelled | UserInvite | c11b5843-b5d4-49a3-a60c-bb9d98af5323
 4ea0b245-abad-4768-8e86-7de0c018ae6d | user.invite.cancelled | UserInvite | e3475ac0-0995-4958-8303-6bbf58446434
```

Metadata (most recent row, item 3 cancel):

```json
{
  "inviteId": "c11b5843-b5d4-49a3-a60c-bb9d98af5323",
  "targetEmail": "item3-cancel-then-accept@example.test",
  "cancelledByUserId": "4ea0b245-abad-4768-8e86-7de0c018ae6d"
}
```

beforeData (snapshot — no `tokenHash`, redacted by `AuditLogService`):

```json
{
  "role": "operator",
  "email": "item3-cancel-then-accept@example.test",
  "createdAt": "2026-05-20T09:10:40.429Z",
  "expiresAt": "2026-05-27T09:10:40.000Z",
  "invitedByUserId": "4ea0b245-abad-4768-8e86-7de0c018ae6d"
}
```

**Result:** PASS — exactly one `user.invite.cancelled` row per cancel. Metadata shape `{ inviteId, targetEmail, cancelledByUserId }` matches PRD verbatim. `actorUserId` resolves to the admin. `beforeData` captures the invite snapshot for forensic audit (token hash is redacted by `AuditLogService` per existing convention; not in the persisted JSON).

## Operator-cancel (Item 2) — confirm no audit row leaked

No `user.invite.cancelled` row was created for the 403 case (only two rows total post-run, both from items 1 and 3). The 403 short-circuits before the service method, so no audit row, no DB mutation, no side effects.

## Notes / surprises

- The new route `/api/users/invites/:inviteId` is mounted on the existing `UsersController` (which is already `@RequireRoles('admin')` guarded). Sequence vs `@Delete(':userId')` is safe because the two routes have different segment counts (`/users/invites/:id` vs `/users/:id`); the more-specific route is also declared first for clarity.
- Audit `action` name is `user.invite.cancelled` per PRD verbatim. Existing invite actions in the codebase use the slightly different prefix `user_invite.created` / `user_invite.accepted` (snake-prefix). I followed PRD wording because the PRD-binding clause is explicit. Future cleanup ticket can normalize all three to one prefix.
- `tokenHash` does NOT leak into `beforeData` — `AuditLogService.redactAuditData` already redacts any key matching `tokenhash`/`token_hash`. Confirmed at runtime above.
- Accept-invite endpoint now returns 404 instead of 400 for unknown tokens. This is the only existing-behavior change. Frontend already handles the response generically via the `'message' in error` branch, so the existing accept-invite UI text remains unchanged.
