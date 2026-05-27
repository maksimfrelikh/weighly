# poc-cloudflare-worker

Throwaway **Phase 0 PoC** validating the migration stack: **Cloudflare Workers + D1 + Hono + Prisma 7 + WebCrypto**. Not production. Does not touch `backend/` or `frontend/`.

👉 **Read [`POC-REPORT.md`](./POC-REPORT.md)** for the full findings, measurements, and recommendation.

## Quick start

```bash
npm install
cp .env.example .env
npm run generate            # prisma generate
npm run migrate:apply:local # apply migrations/0001_init.sql to local D1
npm run dev                 # wrangler dev --local on :8787
```

Then hit the endpoints under `/poc` (see `POC-REPORT.md §8`), e.g.:

```bash
curl localhost:8787/poc/health
curl localhost:8787/poc/fk-test
curl "localhost:8787/poc/timing?iterations=210000&runs=8"
```

## What's here

| Path | What |
|---|---|
| `src/index.ts` | Hono app + all `/poc/*` endpoints |
| `src/password.ts` | PBKDF2-SHA512 via Web Crypto (replicates `backend/src/auth/password.util.ts`) |
| `prisma/schema.prisma` | PocUser / PocStore / PocCategory (+ composite self-FK) |
| `prisma.config.ts` | Prisma 7 Migrate config (CLI-only shadow DB) |
| `migrations/0001_init.sql` | Generated DDL applied to D1 |
| `wrangler.toml` | One D1 binding (`DB`), local-only |

The Prisma client (`src/generated/`), `node_modules/`, `.wrangler/`, and `.env` are git-ignored — regenerate with `npm install && npm run generate`.
