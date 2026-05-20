# BUG-REG-062 — 72 leaks detected in repo history (gitleaks full scan)

**Status:** OPEN — backlog
**Severity:** medium (sleeping problem, not active threat post-rotation)
**Area:** repo history / secrets hygiene / CI
**Origin:** 2026-05-20, BUG-REG-049 diligence pass.

## Discovery

Side-finding from the BUG-REG-049 (PR #30) diligence pass on 2026-05-20.

- **gitleaks PR-scoped scan** (`main..origin/fix/bug-reg-049`): **0 leaks introduced** by PR #30. Clean.
- **gitleaks full-repo history scan**: **72 historical hits** across the repo's git history.

## Why not blocking PR #30

These 72 historical leaks pre-date PR #30 — they exist in commits already on `main` long before the BUG-REG-049 branch. The active-secret risk is already mitigated by the secret rotation Maksim performed earlier on 2026-05-20 — current production runs on a fresh random `POSTGRES_PASSWORD` populated 2026-05-20, not the historical literal that lives in git history.

Therefore: PR #30 ships as planned; the 72 historical hits are tracked as a separate audit task here (BUG-REG-062).

## Scope (proposed)

- **(a) Full inventory** of leaks: file × commit × secret-type breakdown from gitleaks output, with first-introduced commit per leak and last-seen revision.
- **(b) Rotation confirmation** for every secret category surfaced in (a):
  - DB password — ✓ already confirmed rotated 2026-05-20.
  - JWT / session secrets — check.
  - SMTP credentials — check.
  - SendGrid / mailer API keys — check.
  - Any other categories surfaced by (a) — check.
- **(c) Remediation decision** (Maksim's call once a–b are in hand):
  - **BFG Repo-Cleaner** repo-rewrite.
  - **`git filter-repo`** repo-rewrite.
  - **Accept-as-historical** (rely on rotation; document in SECURITY.md). Note: squashing `main` to drop history is unlikely viable given active collaboration / outstanding PRs / forks.
- **(d) CI gate**: add gitleaks (or equivalent) as a required-check on PRs going forward, so any new secret introduction is caught at PR time, not in a post-hoc audit.

## Acceptance (rough)

1. Inventory delivered (full gitleaks output, normalized into a per-category table).
2. Rotation status confirmed for every category in the inventory.
3. CI gate live (gitleaks running on every PR, blocking on new leaks).
4. Maksim decides remediation path (rewrite vs accept).

## Out of scope

The history-rewrite itself (BFG / `git filter-repo` execution + force-push + coordination with all collaborators / forks). That's a separate large task — only kicked off once steps 1–3 are done and Maksim has chosen `rewrite` in step 4.

## Wave placement

Wave 7+ backlog. Not blocking any active wave; rotation already mitigates active-secret risk.

## Cross-references

- [[BUG-REG-049]] — `.env.example` + startup validation + compose required-var syntax (the PR whose diligence pass surfaced this).
- [[BUG-REG-051]] — GitHub Actions CI (this is where the gitleaks gate from (d) will live).
