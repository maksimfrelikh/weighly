# BUG-REG-048 — Cross-cutting pagination — §4.4 acceptance evidence

**Date:** 2026-05-20
**Branch:** `fix/bug-reg-048-cross-cutting-pagination`
**Verified by:** Manager (subagent, dev capacity)
**Stack:** local docker compose, backend rebuilt with branch HEAD, postgres seed data
**Login:** `admin@example.com` (default seeded admin)

## Summary

Standardized response envelope `{ data, meta: { total, limit, offset } }` shipped across 5 paginated
surfaces (AuditLog, ScaleSyncLog, Banner, Product, Price). Shared FE `<Pagination/>` component wired
on all 4 list pages. Backward-compat for legacy `?limit=N`-only and `?take=N&skip=M` callers preserved.

## §4.4 criterion 1 — standardized envelope per surface

### Surface 1 — `GET /api/logs/global` (combined audit + sync, per-array meta — contract option b)

```
curl -s -b cookies http://localhost:3000/api/logs/global
```
```json
{
  "auditLogs":     { "data": [...], "meta": { "total": 1206, "limit": 50, "offset": 0 } },
  "scaleSyncLogs": { "data": [...], "meta": { "total":   71, "limit": 50, "offset": 0 } },
  "filters":       { "storeId": null, "entityType": null, "action": null, "status": null,
                     "dateFrom": null, "dateTo": null, "limit": 50, "offset": 0 }
}
```

Per-array meta (contract §"Proposed envelope" option b) — single combined endpoint preserved, each
array wraps its own slice + meta. Live: `auditLogs.meta = {total: 1206, limit: 50, offset: 0}`,
`scaleSyncLogs.meta = {total: 71, limit: 50, offset: 0}`. Slice sizes match `limit`.

### Surface 2 — `GET /api/stores/:storeId/logs`

Same shape as `/api/logs/global`, plus top-level `storeId` echo. Per-store scoping preserved via
`@RequireStoreAccess('storeId', 'params')` on the controller — see `backend/src/logs/logs.controller.ts:33`.

### Surface 3 — `GET /api/stores/:storeId/advertising/banners`

```
curl -s -b cookies http://localhost:3000/api/stores/<id>/advertising/banners
```
```json
{ "data": [ /* banner items */ ], "meta": { "total": 1, "limit": 50, "offset": 0 } }
```

Top-level keys = `["data", "meta"]`. Was: `{banners: [...]}` (no pagination).

### Surface 4 — `GET /api/products`

```
curl -s -b cookies 'http://localhost:3000/api/products?limit=50&offset=0'
```
```json
{ "data": [ /* 50 product items */ ], "meta": { "total": 82, "limit": 50, "offset": 0 } }
```

Top-level keys = `["data", "meta"]`. Was: `{products, total, take, skip}`.

### Surface 5 — `GET /api/stores/:storeId/prices`

```
curl -s -b cookies http://localhost:3000/api/stores/<id>/prices
```
```json
{
  "catalog": { "id": "...", "storeId": "...", "name": "Main catalog", "status": "active" },
  "data":    [],
  "meta":    { "total": 0, "limit": 50, "offset": 0 }
}
```

Top-level keys = `["catalog", "data", "meta"]`. `catalog` retained as sibling (entity reference, not
pagination metadata). Was: `{catalog, prices: [...]}`.

## §4.4 criterion 2 — FE `<Pagination/>` component renders + controls work

Component: `frontend/src/shared/pagination/Pagination.tsx`. Exported `<Pagination/>` props:
`{ meta, onOffsetChange, onLimitChange, pageSizeOptions?, label? }`. Renders:

- `<span data-testid="pagination-label">N–M of T &lt;label&gt;</span>`
- `<button data-testid="pagination-prev">Prev</button>` (disabled at offset 0)
- `<button data-testid="pagination-next">Next</button>` (disabled at offset+limit ≥ total)
- `<select data-testid="pagination-page-size">` with options [10, 20, 50, 100]

Wired on 4 list pages: `GlobalLogsPage` (L474), `StoreLogsTab` (L506), `AdvertisingTab` (L674),
`ProductsPage` (L2110), `PricesTab` (L1913). `npx tsc -b` + `npx vite build` both clean
(`382.02 kB` bundle, 59 modules transformed).

`onLimitChange` callbacks reset offset to 0 (page-size change resets to page 1). Filter/search
changes also reset offset to 0 — see `handleFiltersChange`, `handleSearchChange`,
`handleStatusChange`, `handleCategoryChange`, `handleMissingPriceChange` in `main.tsx`.

## §4.4 criterion 3 — large dataset (>50 items) navigation correct

Products: 82 items total in seed data. Two consecutive pages:

```
GET /api/products?limit=50&offset=0
→ data: 50 items, meta: { total: 82, limit: 50, offset: 0 }
   first id: 1c1b1b98-601c-476b-bc66-4fe4600ce653
   last  id: 21fe968b-4f21-4aa1-a26b-9afcce127278

GET /api/products?limit=50&offset=50
→ data: 32 items (= 82 − 50), meta: { total: 82, limit: 50, offset: 50 }
   first id: bf51b223-79b8-449d-8d4a-adff922fb7b5
   last  id: 46887ced-959e-4e21-8a7a-cdaf99a3a56a

Overlap check (set intersection): set() — empty.
Union size: 82 (= meta.total)
```

Logs audit (1206 items total):
- `?limit=10&offset=0`: first id `dd2ba0bd-…`, item count 10, total 1206.
- `?limit=10&offset=50`: first id `3b1a62bf-…`, item count 10, total 1206.

Different first ids per offset → backend returns correct slice. `meta.total` constant → COUNT(*)
matches filter scope. FE `<Pagination/>` `"N–M of T &lt;label&gt;"` label uses `meta.offset+1` and
`Math.min(meta.offset + meta.limit, meta.total)` — indices match the actual returned slice.

Page-size change reset: `handleLimitChange` in each consumer calls `setOffset(0)` before
`setLimit(next)` — verified in code at `main.tsx:478`, `:511`, `:674`, `:2118`, `:1916`.

## §4.4 criterion 4 — permission boundary preserved

The contract change is response-shape only. No guards were removed or modified on any touched
controller. Verified:

```
backend/src/advertising/advertising.controller.ts:34: @UseGuards(SessionGuard, RolesGuard, StoreAccessGuard)
backend/src/advertising/advertising.controller.ts:36: @RequireStoreAccess('storeId', 'params')
backend/src/logs/logs.controller.ts:21:               @UseGuards(SessionGuard, RolesGuard, StoreAccessGuard)
backend/src/logs/logs.controller.ts:33:               @RequireStoreAccess('storeId', 'params')
backend/src/prices/prices.controller.ts:27:           @UseGuards(SessionGuard, RolesGuard, StoreAccessGuard)
backend/src/prices/prices.controller.ts:29:           @RequireStoreAccess('storeId', 'params')
```

Live unauthenticated probe (no session cookie):

```
GET /api/stores/<id>/advertising/banners → HTTP 401
GET /api/stores/<id>/logs                → HTTP 401
GET /api/stores/<id>/prices              → HTTP 401
GET /api/products                        → HTTP 401
GET /api/logs/global                     → HTTP 401
```

All 5 surfaces reject without a session. Store-scoped surfaces additionally enforce
`StoreAccessGuard + @RequireStoreAccess('storeId', 'params')` — operator access is gated to assigned
stores by the same guard chain as before the contract change (decorators + guards untouched).
Products (admin-or-operator, no store scoping) and `/api/logs/global` (admin only) preserve their
role-only gating.

## Backward compat — `?limit=N` (no offset) and `?take=N&skip=M`

```
GET /api/logs/global?limit=20
→ auditLogs.meta: { total: 1206, limit: 20, offset: 0 }   # offset defaults to 0 ✓

GET /api/products?take=8&skip=4
→ meta: { total: 82, limit: 8, offset: 4 }                # take/skip aliased into limit/offset ✓

GET /api/logs/global?limit=999
→ auditLogs.meta: { total: 1206, limit: 200, offset: 0 }  # clamped to MAX_LIMIT=200 ✓
```

## §4.3 — scoped unit tests

`backend/src/shared/pagination.spec.ts` — 25 tests pass:

```
node --test --experimental-strip-types --no-warnings src/shared/pagination.spec.ts
ℹ tests 25
ℹ suites 4
ℹ pass 25
ℹ fail 0
```

Coverage: parseLimit defaults, NaN, clamping (MAX=200), zero/negative; parseOffset defaults, NaN,
negative, very-large values; buildMeta envelope shape (`{total, limit, offset}` exact key order);
backward-compat scenario `?limit=N` no offset.

Adjacent specs still pass — `advertising.service.spec.ts` (BUG-REG-040 banner imageUrl validation),
`email-validation.util.spec.ts` (BUG-UX-009/BUG-REG): 27 tests, 0 failures.

## §4.2 — build clean

```
backend: npx nest build   → exit 0, no warnings
frontend: npx tsc -b      → exit 0
frontend: npx vite build  → 59 modules, 382.02 kB bundle, exit 0
```

## Decision authority entries (per task brief)

1. **Envelope keys:** `data` and `meta` (PRD verbatim, no aliasing). `meta` keys ordered `{total, limit, offset}`.
2. **Logs combined endpoint:** option **(b) per-array meta** — kept combined endpoint, each array
   wraps its own `{data, meta}`. Reason: avoids breaking the single-query global-logs page in FE and
   matches contract §"Proposed envelope" option (b) verbatim.
3. **Sort defaults:** preserved per-surface — `logs: createdAt desc`, `banners: [status asc, sortOrder asc, createdAt asc]`,
   `products: [name asc, defaultPluCode asc]`, `prices: [categoryId asc, sortOrder asc, createdAt asc]`.
   No silent re-sort.
4. **Pagination defaults:** `DEFAULT_LIMIT=50`, `MAX_LIMIT=200` shared via `backend/src/shared/pagination.ts`.
   Bumped from per-surface `MAX=100` to `MAX=200` per PRD decision.
5. **Products `take/skip`:** accepted as aliases for `limit/offset`. Service prefers `input.limit ?? input.take`
   and `input.offset ?? input.skip`. Removed the unused `parsePaginationNumber` helper that previously
   threw `BadRequestException` for out-of-range values; new behavior silently clamps to defaults/MAX_LIMIT
   (consistent with other surfaces and contract spirit of graceful degradation).
6. **FE Pagination library:** custom component (no external dep). 4-control surface (Prev/Next/label/page-size)
   doesn't justify a library; existing project styling (`.secondary-button`) reused.
7. **Prices catalog sibling:** kept `catalog` as a top-level sibling alongside `data` and `meta`. Catalog is
   an entity reference (the active catalog), not pagination state.

## Out of scope (per contract — verified not touched)

- No search/filter additions (existing search/category/status filters on products/prices/banners/logs preserved).
- No sort customization (sort defaults per surface kept exactly as before).
- No cursor-based pagination (offset-based per PRD).
- `GET /api/users` — not in 5-surface list; not touched (volume small per contract note).
- `GET /api/stores`, `/api/scales`, `/api/catalog/...` — not in 5-surface list; not touched.

## Known limitation (flagged, not fixed inline)

`PricesTab` populates the category-filter dropdown from a second `useListStorePricesQuery({ storeId, limit: 200 })`
call. With pagination, this fetches at most `MAX_LIMIT=200` placements — so a store with >200 catalog
placements may have categories missing from the dropdown. Long-term fix: use the existing
`useListCatalogCategoriesQuery(storeId)` hook for the dropdown source. Not fixed in this PR
(scope expansion, separate concern — open a follow-up BUG-REG via Lead if desired).
