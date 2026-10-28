# BUG-REG-051 — GitHub Actions CI pipeline missing

**Status:** CI есть с `8eb3bca` (2026-05-21, #36): `.github/workflows/ci.yml` идёт на каждый PR и push в `main`. Тесты бэкенда — `node --test` по `*.spec.ts`, а не jest; `npm test` фронтенда добавлен в job 2026-10-28. **Не выполнено:** защита `main` не требует зелёного CI — `required_status_checks` выключены (`enforcement_level: off`, проверок нет; публичный API GitHub, 2026-10-28).
**Severity:** medium
**Area:** infra / CI
**Origin:** pre-Wave-5 infrastructure review (2026-05-20). No `.github/workflows/` directory exists; PRs merge without automated tests / lint / build verification. Manual gates (§4.2 code-glance, §4.3 repro) are run by the Manager subagent but are not an automated safety net — a Manager that skips a step or a Lead who self-merges without dispatching has nothing to catch it.

## Steps to reproduce

1. Open any PR (e.g. #17, #18, #19).
2. Observe: no CI checks listed in the PR sidebar.
3. Merge is unblocked regardless of whether `npm test` would pass.

## Expected

Every PR triggers an automated workflow; merge blocks on failure. Squash-merge to `main` requires CI green.

## Actual

Zero CI; manual gates only. Quality of merges depends entirely on whether the Manager dispatch ran the §4.3 repro and whether the Lead remembered to re-check before merge.

## Proposed minimum-viable workflow

- **(a)** `npm test` for backend + frontend (jest specs).
- **(b)** `bash -n scripts/*.sh` syntax check + `shellcheck` if available.
- **(c)** `npx prisma format --check` + `npx prisma validate`.
- **(d)** `docker build` to a throwaway tag — verifies the Dockerfile remains valid.
- **(e)** `gitleaks detect` to catch committed secrets before they hit `main`.

## Acceptance criteria

- [ ] `.github/workflows/ci.yml` runs on every PR and on push to `main`.
- [ ] Branch protection on `main` requires CI green before merge.
- [ ] Workflow takes < 10 min wall-time on a hot cache to stay practical.

## Out of scope

- Deployment automation — separate [[BUG-REG-052]].
- E2E browser tests — separate effort; current Tester runs manual verifies in-session.
- CodeQL / SAST — defer until the codebase grows.

## Wave placement

Wave 5 candidate (significant value, low blast radius — workflow files only, no runtime code touched).

## Cross-references

- [[BUG-REG-049]] — CI can also lint `.env.example` schema against committed validator.
- [[BUG-REG-052]] — deploy automation depends on this landing first.
