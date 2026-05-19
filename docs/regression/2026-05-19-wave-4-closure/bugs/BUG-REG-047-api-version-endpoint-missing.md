# BUG-REG-047 — No HTTP `/api/version` endpoint for deployed-build identification

**Status:** OPEN — backlog
**Severity:** low
**Area:** backend / health / ops / CI-CD
**Found during:** Wave 4 closure verify (2026-05-19) — side finding #4 in `docs/regression/2026-05-19-wave-4-closure/SUMMARY.md`. Also flagged in the prior `96d7d63` Block 2 doc. Confirmed cause of Wave 4 Block 2 FAIL-FAST: staging was serving pre-fix code (`abf5803`) but there was no way to detect that without shell access to the container.

## Steps to reproduce

1. `curl https://staging.maksimfrelikh.ru/api/version` → **404 Not Found**.
2. Likewise on prod (`https://maksimfrelikh.ru/api/version`) → 404.
3. To identify the deployed build, you currently need `docker inspect` on the backend image SHA from the host — shell access only.

## Expected

`GET /api/version` returns a small JSON payload that lets a tester / CI job verify "is the fix actually live" without container shell access:

```json
{
  "commit": "<git-short-sha>",
  "builtAt": "<ISO-8601 UTC>",
  "version": "<package.json version or branch/tag>"
}
```

Public (no auth) is fine — this is build identification, not a secret. Same as `/api/health`.

## Actual

- Endpoint does not exist.
- Wave 4 Block 2 FAIL-FAST consumed ~30 minutes of Manager debugging time because the only way to confirm "did the staging redeploy actually replace the backend image?" was `docker inspect` from a shell session on the host.

## Hypothesis paths (for the eventual fix)

- **(a) `git rev-parse` in Dockerfile build-arg → ENV var → endpoint.** Build-time injection via `ARG GIT_SHA` + `ENV BUILD_SHA=$GIT_SHA`. Backend reads `process.env.BUILD_SHA` and returns it. Simplest, no runtime dependency on git.
- **(b) Version from `package.json` + git short SHA injected at build time.** Slightly richer payload (semver + commit). Same Dockerfile ARG mechanism, just two env vars.
- **(c) Static endpoint in the health controller with build-time data.** Mount the JSON as a static file written at build time (`backend/dist/build-info.json`), endpoint just returns its contents. Easiest to extend with extra metadata later.

## Out of scope

- Detailed dependency versions / full SBOM. Separate ticket if a richer build report is ever needed.
- Frontend build identification. The Vite-built SPA already includes a hashed asset filename (`/assets/index-*.js`); a separate `/version.json` static asset for the frontend is a different ticket.
- Auth on the endpoint. Build identification should be public for tooling simplicity.

## Wave placement

Backlog. Quick win — implementation is ~20 lines plus a Dockerfile ARG. Pick up when the next backend infra cleanup wave runs, or bundle with [[BUG-REG-041]] (production hardening).
