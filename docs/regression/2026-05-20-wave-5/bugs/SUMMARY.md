# Wave 5 closure — side findings (stub index)

Side findings spun out of [Wave 5 closure regression SUMMARY](../SUMMARY.md) (lines 129-183). All 7 stubs opened in one batch on 2026-05-20 after Maksim's approval (`approve` on PR #26 + "ALL 7 side findings → open as BUG-REG-NNN stubs in separate docs PR" — auto-merge per §13).

Severity guide (from Maksim's dispatch):

- **medium** — recurrence pattern or broken endpoint
- **low** — cleanup / docs / known limitation alignment

| Stub | Title | Severity | Source SUMMARY line |
|---|---|---|---|
| [BUG-REG-055](BUG-REG-055-deploy-staging-build-sha-injection.md) | `deploy-staging.sh` missing `BUILD_SHA` / `BUILT_AT` injection parity with prod | **medium** | #1, lines 131-139 |
| [BUG-REG-056](BUG-REG-056-audit-action-naming-mixed-family.md) | Audit-action naming mixed family (`user.invite.cancelled` vs `user_invite.*`) | low | #2, lines 141-146 |
| [BUG-REG-057](BUG-REG-057-node-env-dev-override-compose.md) | `NODE_ENV=production` is the docker-compose default with no dev-override compose file | low | #3, lines 148-153 |
| [BUG-REG-058](BUG-REG-058-users-me-returns-500.md) | `GET /api/users/me` returns 500 (reserved-keyword collides with `:userId` catch-all) | **medium** | #4, lines 155-161 |
| [BUG-REG-059](BUG-REG-059-banner-delete-endpoint-missing.md) | No `DELETE` for advertising banners — document soft-delete-only contract | low | #5, lines 163-168 |
| [BUG-REG-060](BUG-REG-060-prices-tab-category-dropdown-200-cap.md) | `PricesTab` category dropdown limited to first 200 catalog placements | low | #6, lines 170-174 |
| [BUG-REG-061](BUG-REG-061-invite-email-whitespace-validator-alignment.md) | Brief vs validator alignment on leading/trailing whitespace in invite emails | low | #7, lines 176-183 |

## Notes

- **BUG-REG-055** is the highest-leverage entry — same deploy-pipeline-gap mechanism bit Wave 4 closure (2026-05-19) and Wave 5 closure (2026-05-20). Recommend front-of-queue.
- **BUG-REG-058** is the only true backend defect in the batch — a 500 from a well-formed REST request is a contract violation, even if the canonical client uses `/api/auth/session` instead.
- **BUG-REG-056, -057, -059, -061** are doc / cleanup / alignment — small, low-risk PRs.
- **BUG-REG-060** is a UX gap that only manifests at > 200 catalog placements per store; severity stays low until a store actually crosses that threshold.

## Related

- [Wave 5 closure regression SUMMARY](../SUMMARY.md) — verdict PASS 5/5, source of these 7 findings.
- `MEMORY.md` (workspace) — Wave 5 closure entry will reference this batch.
- High-severity items **not** in this batch (per Maksim 2026-05-20):
  - EmailModule fix — separate dedicated stub (Part 2 work).
