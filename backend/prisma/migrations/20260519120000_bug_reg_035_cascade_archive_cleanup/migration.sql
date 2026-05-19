-- BUG-REG-035: clean up pre-fix limbo records.
-- Invariant after fix: a non-archived row may only exist when every parent in its chain is non-archived.
-- Distribution per pre-fix prod=dev audit (84 rows): see PR body. Single UPDATE per limbo class, atomic, idempotent.
-- Re-running this migration is a no-op once invariant holds.

-- Helper CTE: every catalog whose owning store is archived.
-- StoreCatalog.status itself is intentionally NOT flipped (TASK-063 propose), but its descendants must obey the invariant.

-- 1. StoreProductPrice under an archived Store.
WITH limbo_prices AS (
  SELECT spp.id, spp.status
  FROM "store_product_prices" spp
  JOIN "stores" s ON s.id = spp."storeId"
  WHERE s.status = 'archived'
    AND spp.status <> 'archived'
)
INSERT INTO "audit_logs" ("id", "action", "entityType", "entityId", "storeId", "beforeData", "afterData", "metadata", "createdAt")
SELECT
  gen_random_uuid(),
  'price.archived',
  'StoreProductPrice',
  spp.id,
  spp."storeId",
  jsonb_build_object('status', limbo.status),
  jsonb_build_object('status', 'archived'),
  jsonb_build_object('cascade', jsonb_build_object('migration', 'bug-reg-035-cascade-archive-cleanup', 'reason', 'parent.archive', 'origin', jsonb_build_object('entityType', 'Store', 'entityId', spp."storeId"))),
  NOW()
FROM limbo_prices limbo
JOIN "store_product_prices" spp ON spp.id = limbo.id;

UPDATE "store_product_prices" spp
SET status = 'archived', "updatedAt" = NOW()
FROM "stores" s
WHERE s.id = spp."storeId"
  AND s.status = 'archived'
  AND spp.status <> 'archived';

-- 2. AdvertisingBanner under an archived Store.
WITH limbo_banners AS (
  SELECT b.id, b.status
  FROM "advertising_banners" b
  JOIN "stores" s ON s.id = b."storeId"
  WHERE s.status = 'archived'
    AND b.status <> 'archived'
)
INSERT INTO "audit_logs" ("id", "action", "entityType", "entityId", "storeId", "beforeData", "afterData", "metadata", "createdAt")
SELECT
  gen_random_uuid(),
  'advertising_banner.archived',
  'AdvertisingBanner',
  b.id,
  b."storeId",
  jsonb_build_object('status', limbo.status),
  jsonb_build_object('status', 'archived'),
  jsonb_build_object('cascade', jsonb_build_object('migration', 'bug-reg-035-cascade-archive-cleanup', 'reason', 'parent.archive', 'origin', jsonb_build_object('entityType', 'Store', 'entityId', b."storeId"))),
  NOW()
FROM limbo_banners limbo
JOIN "advertising_banners" b ON b.id = limbo.id;

UPDATE "advertising_banners" b
SET status = 'archived', "updatedAt" = NOW()
FROM "stores" s
WHERE s.id = b."storeId"
  AND s.status = 'archived'
  AND b.status <> 'archived';

-- 3. ScaleDevice under an archived Store.
WITH limbo_devices AS (
  SELECT d.id, d.status
  FROM "scale_devices" d
  JOIN "stores" s ON s.id = d."storeId"
  WHERE s.status = 'archived'
    AND d.status <> 'archived'
)
INSERT INTO "audit_logs" ("id", "action", "entityType", "entityId", "storeId", "beforeData", "afterData", "metadata", "createdAt")
SELECT
  gen_random_uuid(),
  'scale_device.archived',
  'ScaleDevice',
  d.id,
  d."storeId",
  jsonb_build_object('status', limbo.status),
  jsonb_build_object('status', 'archived'),
  jsonb_build_object('cascade', jsonb_build_object('migration', 'bug-reg-035-cascade-archive-cleanup', 'reason', 'parent.archive', 'origin', jsonb_build_object('entityType', 'Store', 'entityId', d."storeId"))),
  NOW()
FROM limbo_devices limbo
JOIN "scale_devices" d ON d.id = limbo.id;

UPDATE "scale_devices" d
SET status = 'archived', "updatedAt" = NOW()
FROM "stores" s
WHERE s.id = d."storeId"
  AND s.status = 'archived'
  AND d.status <> 'archived';

-- 4. Category whose owning Store is archived.
WITH limbo_categories AS (
  SELECT c.id, c."catalogId", c.status, sc."storeId"
  FROM "categories" c
  JOIN "store_catalogs" sc ON sc.id = c."catalogId"
  JOIN "stores" s ON s.id = sc."storeId"
  WHERE s.status = 'archived'
    AND c.status <> 'archived'
)
INSERT INTO "audit_logs" ("id", "action", "entityType", "entityId", "storeId", "beforeData", "afterData", "metadata", "createdAt")
SELECT
  gen_random_uuid(),
  'category.archived',
  'Category',
  limbo.id,
  limbo."storeId",
  jsonb_build_object('status', limbo.status),
  jsonb_build_object('status', 'archived'),
  jsonb_build_object('cascade', jsonb_build_object('migration', 'bug-reg-035-cascade-archive-cleanup', 'reason', 'parent.archive', 'origin', jsonb_build_object('entityType', 'Store', 'entityId', limbo."storeId"))),
  NOW()
FROM limbo_categories limbo;

UPDATE "categories" c
SET status = 'archived', "updatedAt" = NOW()
FROM "store_catalogs" sc, "stores" s
WHERE c."catalogId" = sc.id
  AND sc."storeId" = s.id
  AND s.status = 'archived'
  AND c.status <> 'archived';

-- 5. CatalogProductPlacement under an archived parent: Store, Category (subtree), Product.
WITH limbo_placements AS (
  SELECT DISTINCT
    p.id,
    p.status,
    sc."storeId",
    CASE
      WHEN s.status = 'archived' THEN 'Store'
      WHEN c.status = 'archived' THEN 'Category'
      WHEN prd.status = 'archived' THEN 'Product'
    END AS origin_type,
    CASE
      WHEN s.status = 'archived' THEN sc."storeId"
      WHEN c.status = 'archived' THEN c.id
      WHEN prd.status = 'archived' THEN prd.id
    END AS origin_id
  FROM "catalog_product_placements" p
  JOIN "store_catalogs" sc ON sc.id = p."catalogId"
  JOIN "stores" s ON s.id = sc."storeId"
  JOIN "categories" c ON c.id = p."categoryId"
  JOIN "products" prd ON prd.id = p."productId"
  WHERE p.status <> 'archived'
    AND (s.status = 'archived' OR c.status = 'archived' OR prd.status = 'archived')
)
INSERT INTO "audit_logs" ("id", "action", "entityType", "entityId", "storeId", "beforeData", "afterData", "metadata", "createdAt")
SELECT
  gen_random_uuid(),
  'placement.archived',
  'CatalogProductPlacement',
  limbo.id,
  limbo."storeId",
  jsonb_build_object('status', limbo.status),
  jsonb_build_object('status', 'archived'),
  jsonb_build_object('cascade', jsonb_build_object('migration', 'bug-reg-035-cascade-archive-cleanup', 'reason', 'parent.archive', 'origin', jsonb_build_object('entityType', limbo.origin_type, 'entityId', limbo.origin_id))),
  NOW()
FROM limbo_placements limbo;

UPDATE "catalog_product_placements" p
SET status = 'archived', "updatedAt" = NOW()
FROM "store_catalogs" sc, "stores" s, "categories" c, "products" prd
WHERE p."catalogId" = sc.id
  AND sc."storeId" = s.id
  AND c.id = p."categoryId"
  AND prd.id = p."productId"
  AND p.status <> 'archived'
  AND (s.status = 'archived' OR c.status = 'archived' OR prd.status = 'archived');

-- 6. StoreProductPrice whose Product is archived (separate from Store-based price cleanup above).
WITH limbo_prices_by_product AS (
  SELECT spp.id, spp.status, spp."storeId", spp."productId"
  FROM "store_product_prices" spp
  JOIN "products" p ON p.id = spp."productId"
  WHERE p.status = 'archived'
    AND spp.status <> 'archived'
)
INSERT INTO "audit_logs" ("id", "action", "entityType", "entityId", "storeId", "beforeData", "afterData", "metadata", "createdAt")
SELECT
  gen_random_uuid(),
  'price.archived',
  'StoreProductPrice',
  limbo.id,
  limbo."storeId",
  jsonb_build_object('status', limbo.status),
  jsonb_build_object('status', 'archived'),
  jsonb_build_object('cascade', jsonb_build_object('migration', 'bug-reg-035-cascade-archive-cleanup', 'reason', 'parent.archive', 'origin', jsonb_build_object('entityType', 'Product', 'entityId', limbo."productId"))),
  NOW()
FROM limbo_prices_by_product limbo;

UPDATE "store_product_prices" spp
SET status = 'archived', "updatedAt" = NOW()
FROM "products" p
WHERE p.id = spp."productId"
  AND p.status = 'archived'
  AND spp.status <> 'archived';
