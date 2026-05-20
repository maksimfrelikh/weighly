# BUG-REG-060 — PricesTab category dropdown 200-cap — §4.4 acceptance evidence

**Date:** 2026-05-20
**Branch:** `fix/bug-reg-060` (off `origin/main@3729a4a`)
**Verified by:** Manager subagent (Wave 8 Task 2)
**Stack:** local docker compose (postgres + backend + frontend), all containers rebuilt from branch HEAD
**Login:** `admin@example.com` (default seeded admin)

## Summary

Replaced the `PricesTab` category dropdown's hidden 200-placement cap with a
dedicated flat distinct-category endpoint. The dropdown now lists every active
category in the store's active catalog that has at least one active placement
of an active product — uncapped — so stores with > 200 catalog placements no
longer silently drop categories.

## Scope diff (atomic single PR, BE + FE)

```
 backend/src/prices/prices.controller.ts   |  5 +++++
 backend/src/prices/prices.service.ts      | 18 ++++++++++++++++++
 backend/src/prices/prices.service.spec.ts | (new, 99 lines)
 frontend/src/features/prices/pricesApi.ts |  5 +++++
 frontend/src/main.tsx                     | 11 +++-------
 4 files changed + 1 new spec, ~130 lines combined production code+tests
```

## Decisions taken (per task brief — declared here, not in code)

1. **Route:** `GET /api/stores/:storeId/prices/categories` (under `PricesController`),
   *not* the brief-suggested `/catalog/categories`. The suggested route already
   exists in `CatalogController` and returns a category *tree* with a
   `canAcceptActivePlacements` per-node flag — a catalog-management view. The
   dropdown needs a *distinct flat list scoped to categories that have at least
   one active placement of an active product*, which is a different semantic
   (the prices-tab view). Putting the new endpoint under `/prices` keeps it
   colocated with its only consumer and reuses `PricesController`'s existing
   guard chain unchanged.

2. **RBAC:** `SessionGuard + RolesGuard + StoreAccessGuard`,
   `@RequireRoles('admin', 'operator')`, `@RequireStoreAccess('storeId', 'params')`
   — controller-level decorators on `PricesController` are inherited by the new
   `@Get('categories')` method, exactly mirroring `GET /stores/:storeId/prices`.
   Live 401 boundary probe below.

3. **Response shape:** **flat array** of `{id, name, shortName, status}` (no
   envelope, no pagination). Category sets per store are small and bounded
   (typically dozens, hundreds at most — the existing PricesTab cap was 200
   placements, not 200 categories); pagination is not warranted. The shape
   matches the existing `PriceCategory` FE type one-for-one, so the dropdown
   consumer needs zero adapter code. BUG-REG-048's `{data, meta}` envelope is
   reserved for genuinely paginated surfaces — applying it here would be
   ceremonial, not load-bearing.

4. **Cache strategy:** new RTK Query hook `useListStorePriceCategoriesQuery`
   provides tag `{ type: 'Prices', id: storeId }` — the *same* tag the existing
   `useListStorePricesQuery` uses. Catalog mutations (create/move/reorder
   placement, create/update/reorder category) already invalidate that tag in
   `catalogApi.ts`, so the new query automatically refetches when the underlying
   set could change. No new tag, no new invalidation wiring — zero coupling
   regression to BUG-REG-048 prices-list envelope.

5. **Removed code:** the second `useListStorePricesQuery({ storeId, limit: 200 })`
   call and the `useMemo`-built distinct-category map in
   `frontend/src/main.tsx:1944-1953`. The new endpoint already returns the list
   distinct, alphabetically sorted, so the client-side dedup/sort is dead code.

## §4.4 criterion — dropdown shows categories past the previous 200-cap

### Seed (idempotent SQL, documented in commit body)

```
psql script: /tmp/seed-bug-reg-060.sql (re-runnable; ON CONFLICT DO NOTHING)
target store:    1cf0f4ba-71a8-4a0d-b87d-8e5494baf263  (UAT20260515P4195540)
target catalog:  e8f19943-571c-4eba-8b42-044ac952e7e6  (status=active)

inserts: 250 products  defaultPluCode='BUG060-0001'..'BUG060-0250'
         250 categories name='BUG060 Category 0001'..'0250' (active)
         250 placements 1:1 category↔product (active)

post-seed verification query:
  bug060_active_categories | active_placements_total
  -------------------------+------------------------
                       250 |                    252   (252 = 250 BUG060 + 2 pre-existing UAT)
```

### Before-fix behavior (reproduction of the bug)

```
GET /api/stores/1cf0f4ba-71a8-4a0d-b87d-8e5494baf263/prices?limit=200
→ data: 200 rows  (hard cap — MAX_LIMIT=200 from BUG-REG-048)
→ meta: { total: 252, limit: 200, offset: 0 }
→ distinct categories visible in the first 200 rows: 200
→ last visible category: "BUG060 Category 0200"

Dropdown built from those 200 rows would show 200 categories — missing
"BUG060 Category 0201" through "0250" and the 2 pre-existing UAT categories
(52 hidden categories).
```

### After-fix behavior (new endpoint)

```
GET /api/stores/1cf0f4ba-71a8-4a0d-b87d-8e5494baf263/prices/categories
→ flat array, length = 252  (= total distinct active categories with active placements)
→ first 3: BUG060 Category 0001, 0002, 0003
→ last 3:  BUG060 Category 0250,
           UAT 2026-05-15 Phase 4 ... Category,
           UAT 2026-05-15 Phase 5 ... Category
→ categories past the previous 200-cap visible: 0200, 0201, 0202, 0203, 0204, ...
→ sort: name ASC (BUG060... < UAT...)
```

**252 > 200 — the cap is gone. AC met.**

## §4.4 criterion — auth boundary preserved

```
Unauthenticated:
GET /api/stores/<id>/prices/categories  → HTTP 401   ✓
GET /api/stores/<id>/prices             → HTTP 401   ✓  (control, unchanged)

Decorator inheritance verified in code:
backend/src/prices/prices.controller.ts:27 @UseGuards(SessionGuard, RolesGuard, StoreAccessGuard)
backend/src/prices/prices.controller.ts:28 @RequireRoles('admin', 'operator')
backend/src/prices/prices.controller.ts:29 @RequireStoreAccess('storeId', 'params')
→ inherited by the new @Get('categories') method (Nest controller-level decorators apply).
```

## §4.4 criterion — no regression to PricesTab filter/sort/pagination (BUG-REG-048 envelope intact)

```
GET /api/stores/1cf0f4ba-71a8-4a0d-b87d-8e5494baf263/prices?limit=50&offset=0
→ envelope keys: catalog, data, meta              (unchanged)
→ meta: { total: 252, limit: 50, offset: 0 }      (paginated, BUG-REG-048 shape)
→ data: 50 PriceRow items                          (slice)

The new endpoint is purely additive — listStorePrices service method
untouched, prices controller @Get() method untouched, pricesApi
listStorePrices query untouched.

main.tsx PricesTab: search / categoryId filter / missingPrice / limit / offset
all continue to feed useListStorePricesQuery({...}) exactly as before
(main.tsx:1937-1944). Pagination component, refetch, etc. — untouched.
```

## §4.3 — scoped unit tests

`backend/src/prices/prices.service.spec.ts` — 3 tests pass:

```
node --test --experimental-strip-types --no-warnings src/prices/prices.service.spec.ts
▶ PricesService.listStorePriceCategories — BUG-REG-060
  ✔ returns flat distinct active categories for the active catalog (happy path)
  ✔ throws NotFoundException when the store has no active catalog (auth-equivalent boundary on missing resource)
  ✔ rejects empty storeId via the shared findActiveCatalog normaliser (input boundary)
ℹ tests 3  ℹ pass 3  ℹ fail 0
```

Coverage: response shape is a flat array (not enveloped); Prisma where clause
is scoped to the active catalog id, active category status, AND
`placements.some({status:'active', product:{status:'active'}})`; select shape
exactly matches the FE `PriceCategory` type contract; orderBy is
`{name: 'asc'}`; NotFoundException on missing catalog; BadRequestException on
empty storeId.

Adjacent specs untouched:
- `pagination.spec.ts` (BUG-REG-048, 25 tests) — not touched, still passes.
- `scales.service.spec.ts` (BUG-REG-063, 3 tests) — not touched, still passes.

## §4.2 — build clean

```
backend:  npx nest build         → exit 0
frontend: npx tsc -b              → exit 0
frontend: npx vite build          → 59 modules, 381.97 kB bundle, exit 0
security: gitleaks protect --staged  → "no leaks found", exit 0
```

## §4.4 — FE bundle smoke (browser-ready)

```
docker compose build frontend && up -d frontend
→ new bundle: dist/assets/index-CK_jy_5p.js  (replaced index-DnXlqdYr.js)
→ grep 'prices/categories' in served bundle: 1 match
→ context: listStorePriceCategories:l.query({query:i=>`/stores/${i}/prices/categories`,...})

The new RTK Query endpoint is wired in the deployed FE bundle. PricesTab
consumer (main.tsx:1945) calls useListStorePriceCategoriesQuery(storeId) and
binds `categoryOptions = data ?? []`; the <select> dropdown at L1985 renders
`categoryOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)`
— shape-compatible with the new endpoint's `{id,name,shortName,status}`.
```

## §13.1 eligibility (declared, not executed)

**File-list precheck (memory rule, runs before diff-size):**
- `prisma/migrations/**`  — not touched ✓
- `prisma/schema.prisma`  — not touched ✓
- `docker-compose*`        — not touched ✓
- `scripts/deploy-*`        — not touched ✓
- `.github/workflows/**`   — not touched ✓

All clean → continue to diff-size check.

**Diff-size:**
- Production code: BE 23 lines (controller +5, service +18), FE 16 lines (pricesApi +5, main.tsx net +3 → +5/-8)
- Spec: 99 lines new (`prices.service.spec.ts`)
- Doc: ~180 lines (this file, doesn't count toward production diff)
- **Combined production+spec ≈ 138 lines, well under 500.**
- Both halves (BE + FE) covered by tests (BE spec for endpoint; FE build + tsc + live bundle grep for the wiring).

**Verdict: AUTO-MERGE ELIGIBLE per §13.1.**

Per Maksim 2026-05-20 23:02 GMT+2 update (Option B): Manager subagent does
**not** execute the merge — this evidence + a clean pre-merge HB is the
handoff. Lead runs the 10-min veto window forwarding per HEARTBEAT §8 (A),
then executes `gh pr merge --squash --delete-branch` themselves if the window
expires silent, or honours an "approve" mid-window.

## Seed cleanup note

The seed data (`BUG060 Category NNNN` × 250 + matching products + placements)
remains in the local docker postgres for repeatability of the §4.4 evidence.
It is idempotent (ON CONFLICT DO NOTHING) and scoped to the test store
`UAT20260515P4195540`. To remove:

```sql
DELETE FROM catalog_product_placements
  WHERE "catalogId" = 'e8f19943-571c-4eba-8b42-044ac952e7e6'::uuid
    AND "productId" IN (SELECT id FROM products WHERE "defaultPluCode" LIKE 'BUG060-%');
DELETE FROM categories
  WHERE "catalogId" = 'e8f19943-571c-4eba-8b42-044ac952e7e6'::uuid
    AND name LIKE 'BUG060 Category %';
DELETE FROM products WHERE "defaultPluCode" LIKE 'BUG060-%';
```

## Cross-references

- Stub: `docs/regression/2026-05-20-wave-5/bugs/BUG-REG-060-prices-tab-category-dropdown-200-cap.md`
- Parent: BUG-REG-048 (PR #25) — pagination envelope; this is the long-term fix
  for the §"Known limitation" recorded in
  `docs/regression/2026-05-20-wave-5/bug-reg-048-acceptance.md:226-230`.
- Wave 8 placement: Task 2 (post-Wave-8 Task 1 BUG-REG-063, branch off
  `main@3729a4a`).
