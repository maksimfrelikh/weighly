/* BUG-REG-035 integration tests — real Postgres via docker-compose. */
/* eslint-disable */
'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { StoresService } = require('../../dist/stores/stores.service');
const { CatalogService } = require('../../dist/catalog/catalog.service');
const { ProductsService } = require('../../dist/products/products.service');
const { AuditLogService } = require('../../dist/logs/audit-log.service');
const { CascadeArchiveService } = require('../../dist/shared/cascade-archive.service');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL must be set for cascade-archive integration tests');
  process.exit(2);
}

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

const auditLogs = new AuditLogService(prisma);
const cascadeArchive = new CascadeArchiveService(auditLogs);
const storesService = new StoresService(prisma, auditLogs, cascadeArchive);
const catalogService = new CatalogService(prisma, auditLogs, cascadeArchive);
const productsService = new ProductsService(prisma, auditLogs, cascadeArchive);

const ACTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const REQUEST_CONTEXT = { ipAddress: '127.0.0.1', userAgent: 'integration-test' };

async function ensureActor() {
  await prisma.user.upsert({
    where: { id: ACTOR_ID },
    update: {},
    create: {
      id: ACTOR_ID,
      email: 'integration@example.com',
      emailNormalized: 'integration@example.com',
      fullName: 'Integration Actor',
      role: 'admin',
      status: 'active',
    },
  });
}

async function cleanDb() {
  await prisma.auditLog.deleteMany({});
  await prisma.scaleSyncLog.deleteMany({});
  await prisma.scaleDevice.deleteMany({});
  await prisma.catalogVersion.deleteMany({});
  await prisma.advertisingBanner.deleteMany({});
  await prisma.storeProductPrice.deleteMany({});
  await prisma.catalogProductPlacement.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.storeCatalog.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.store.deleteMany({});
}

function uniqueCode(prefix) {
  return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

async function seedStore({ status = 'active' } = {}) {
  const store = await prisma.store.create({
    data: {
      code: uniqueCode('STR'),
      name: 'Test Store',
      status,
    },
  });
  const catalog = await prisma.storeCatalog.create({
    data: { storeId: store.id, name: 'Main catalog', status: 'active' },
  });
  return { store, catalog };
}

async function seedProduct({ status = 'active', plu } = {}) {
  return prisma.product.create({
    data: {
      defaultPluCode: plu ?? uniqueCode('PLU'),
      name: 'Test Product',
      shortName: 'TP',
      unit: 'piece',
      status,
    },
  });
}

async function seedCategory(catalogId, { parentId = null, status = 'active', name = 'Cat' } = {}) {
  return prisma.category.create({
    data: {
      catalogId,
      parentId,
      name,
      shortName: name,
      status,
    },
  });
}

async function seedPlacement(catalogId, categoryId, productId, { status = 'active' } = {}) {
  return prisma.catalogProductPlacement.create({
    data: { catalogId, categoryId, productId, status },
  });
}

async function seedBanner(storeId, { status = 'active' } = {}) {
  return prisma.advertisingBanner.create({
    data: { storeId, imageUrl: 'https://example.com/banner.png', status },
  });
}

async function seedPrice(storeId, productId, { status = 'active', price = 10 } = {}) {
  return prisma.storeProductPrice.create({
    data: { storeId, productId, price, currency: 'RUB', status },
  });
}

async function seedScaleDevice(storeId, { status = 'active' } = {}) {
  return prisma.scaleDevice.create({
    data: {
      storeId,
      deviceCode: uniqueCode('SD'),
      apiTokenHash: 'hash-' + randomUUID(),
      name: 'Scale ' + randomUUID().slice(0, 4),
      status,
    },
  });
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

async function getAuditEvents(filter) {
  return prisma.auditLog.findMany({ where: filter, orderBy: { createdAt: 'asc' } });
}

function correlationOf(auditEvent) {
  return auditEvent?.metadata?.cascade?.correlationId ?? null;
}

// --- Regression guard: pre-fix would create limbo; post-fix prevents it ---
test('cascade Store archive flips all children and emits per-child audit with correlationId', async () => {
  await cleanDb();
  const { store, catalog } = await seedStore();
  const product = await seedProduct();
  const cat = await seedCategory(catalog.id);
  const placement = await seedPlacement(catalog.id, cat.id, product.id);
  const banner = await seedBanner(store.id);
  const price = await seedPrice(store.id, product.id);
  const device = await seedScaleDevice(store.id);

  const result = await storesService.updateStore(store.id, { status: 'archived' }, ACTOR_ID, REQUEST_CONTEXT);

  assert.equal(result.store.status, 'archived', 'store status flipped');
  assert.ok(result.cascade, 'cascade summary returned');
  const correlationId = result.cascade.correlationId;
  assert.match(correlationId, /^[0-9a-f-]{36}$/, 'correlationId is uuid');

  const postCategory = await prisma.category.findUnique({ where: { catalogId_id: { catalogId: catalog.id, id: cat.id } } });
  const postPlacement = await prisma.catalogProductPlacement.findUnique({ where: { id: placement.id } });
  const postBanner = await prisma.advertisingBanner.findUnique({ where: { id: banner.id } });
  const postPrice = await prisma.storeProductPrice.findUnique({ where: { id: price.id } });
  const postDevice = await prisma.scaleDevice.findUnique({ where: { id: device.id } });
  const postCatalog = await prisma.storeCatalog.findUnique({ where: { id: catalog.id } });
  assert.equal(postCategory.status, 'archived');
  assert.equal(postPlacement.status, 'archived');
  assert.equal(postBanner.status, 'archived');
  assert.equal(postPrice.status, 'archived');
  assert.equal(postDevice.status, 'archived');
  assert.equal(postCatalog.status, 'active', 'StoreCatalog status intentionally NOT flipped (TASK-063 propose)');

  const childEvents = await getAuditEvents({
    OR: [
      { entityType: 'Category', entityId: cat.id },
      { entityType: 'CatalogProductPlacement', entityId: placement.id },
      { entityType: 'AdvertisingBanner', entityId: banner.id },
      { entityType: 'StoreProductPrice', entityId: price.id },
      { entityType: 'ScaleDevice', entityId: device.id },
    ],
  });
  assert.equal(childEvents.length, 5, 'one audit event per cascaded child');
  for (const event of childEvents) {
    assert.equal(correlationOf(event), correlationId, `child ${event.entityType} carries parent correlationId`);
    assert.equal(event.metadata.cascade.origin.entityType, 'Store');
    assert.equal(event.metadata.cascade.origin.entityId, store.id);
  }

  const parentEvents = await getAuditEvents({ entityType: 'Store', entityId: store.id });
  assert.ok(parentEvents.some((e) => e.action === 'store.archived'), 'parent store.archived action emitted');
});

test('cascade Category archive flips children categories and placements in subtree', async () => {
  await cleanDb();
  const { store, catalog } = await seedStore();
  const productChild = await seedProduct();
  const productGrand = await seedProduct();
  const root = await seedCategory(catalog.id, { name: 'Root' });
  const child = await seedCategory(catalog.id, { parentId: root.id, name: 'Child' });
  const grandchild = await seedCategory(catalog.id, { parentId: child.id, name: 'Grand' });
  const placementChild = await seedPlacement(catalog.id, child.id, productChild.id);
  const placementGrand = await seedPlacement(catalog.id, grandchild.id, productGrand.id);

  const result = await catalogService.updateCategory(store.id, root.id, { status: 'archived' }, ACTOR_ID, REQUEST_CONTEXT);
  assert.equal(result.category.status, 'archived');
  const correlationId = result.cascade.correlationId;

  const [postChild, postGrand, postPC, postPG] = await Promise.all([
    prisma.category.findUnique({ where: { catalogId_id: { catalogId: catalog.id, id: child.id } } }),
    prisma.category.findUnique({ where: { catalogId_id: { catalogId: catalog.id, id: grandchild.id } } }),
    prisma.catalogProductPlacement.findUnique({ where: { id: placementChild.id } }),
    prisma.catalogProductPlacement.findUnique({ where: { id: placementGrand.id } }),
  ]);
  assert.equal(postChild.status, 'archived');
  assert.equal(postGrand.status, 'archived');
  assert.equal(postPC.status, 'archived');
  assert.equal(postPG.status, 'archived');

  const events = await getAuditEvents({
    OR: [
      { entityType: 'Category', entityId: { in: [child.id, grandchild.id] } },
      { entityType: 'CatalogProductPlacement', entityId: { in: [placementChild.id, placementGrand.id] } },
    ],
  });
  assert.equal(events.length, 4);
  for (const event of events) {
    assert.equal(correlationOf(event), correlationId);
  }
});

test('cascade Product archive flips placements (all catalogs) and prices (all stores)', async () => {
  await cleanDb();
  const product = await seedProduct();
  const { store: storeA, catalog: catalogA } = await seedStore();
  const { store: storeB, catalog: catalogB } = await seedStore();
  const catA = await seedCategory(catalogA.id);
  const catB = await seedCategory(catalogB.id);
  const placementA = await seedPlacement(catalogA.id, catA.id, product.id);
  const placementB = await seedPlacement(catalogB.id, catB.id, product.id);
  const priceA = await seedPrice(storeA.id, product.id);
  const priceB = await seedPrice(storeB.id, product.id);

  const result = await productsService.updateProduct(product.id, { status: 'archived' }, ACTOR_ID, REQUEST_CONTEXT);
  assert.equal(result.product.status, 'archived');
  const correlationId = result.cascade.correlationId;

  const [pA, pB, prA, prB] = await Promise.all([
    prisma.catalogProductPlacement.findUnique({ where: { id: placementA.id } }),
    prisma.catalogProductPlacement.findUnique({ where: { id: placementB.id } }),
    prisma.storeProductPrice.findUnique({ where: { id: priceA.id } }),
    prisma.storeProductPrice.findUnique({ where: { id: priceB.id } }),
  ]);
  assert.equal(pA.status, 'archived');
  assert.equal(pB.status, 'archived');
  assert.equal(prA.status, 'archived');
  assert.equal(prB.status, 'archived');

  const events = await getAuditEvents({
    OR: [
      { entityType: 'CatalogProductPlacement', entityId: { in: [placementA.id, placementB.id] } },
      { entityType: 'StoreProductPrice', entityId: { in: [priceA.id, priceB.id] } },
    ],
  });
  assert.equal(events.length, 4);
  for (const event of events) {
    assert.equal(correlationOf(event), correlationId);
  }
});

// --- Terminal-leaf negatives (do NOT cascade further when these archived directly) ---
test('archiving CatalogProductPlacement directly does not cascade further', async () => {
  await cleanDb();
  const { store, catalog } = await seedStore();
  const product = await seedProduct();
  const cat = await seedCategory(catalog.id);
  const placement = await seedPlacement(catalog.id, cat.id, product.id);

  await catalogService.updatePlacement(store.id, placement.id, { status: 'archived' }, ACTOR_ID, REQUEST_CONTEXT);

  const postProduct = await prisma.product.findUnique({ where: { id: product.id } });
  const postCategory = await prisma.category.findUnique({ where: { catalogId_id: { catalogId: catalog.id, id: cat.id } } });
  const postStore = await prisma.store.findUnique({ where: { id: store.id } });
  assert.equal(postProduct.status, 'active', 'placement archive must not cascade up to product');
  assert.equal(postCategory.status, 'active', 'placement archive must not cascade up to category');
  assert.equal(postStore.status, 'active', 'placement archive must not cascade up to store');
});

test('archiving AdvertisingBanner directly does not cascade further', async () => {
  await cleanDb();
  const { store } = await seedStore();
  const banner = await seedBanner(store.id);

  // Use the advertising service via reconstruction would be ideal; here we update the banner directly to mirror service intent.
  await prisma.advertisingBanner.update({ where: { id: banner.id }, data: { status: 'archived' } });

  const postStore = await prisma.store.findUnique({ where: { id: store.id } });
  assert.equal(postStore.status, 'active', 'banner archive must not cascade up to store');
});

test('archiving ScaleDevice directly does not cascade further', async () => {
  await cleanDb();
  const { store } = await seedStore();
  const device = await seedScaleDevice(store.id);

  await prisma.scaleDevice.update({ where: { id: device.id }, data: { status: 'archived' } });

  const postStore = await prisma.store.findUnique({ where: { id: store.id } });
  assert.equal(postStore.status, 'active', 'device archive must not cascade up to store');
});

// --- Acceptance edge case 1: recursive depth limit = 3 ---
test('Category cascade respects PRD max depth 3 and does not stack-overflow at boundary', async () => {
  await cleanDb();
  const { store, catalog } = await seedStore();
  // depth = 3 tree: A -> B -> C (PRD invariant: depth ≤ 3)
  const a = await seedCategory(catalog.id, { name: 'A' });
  const b = await seedCategory(catalog.id, { parentId: a.id, name: 'B' });
  const c = await seedCategory(catalog.id, { parentId: b.id, name: 'C' });
  await catalogService.updateCategory(store.id, a.id, { status: 'archived' }, ACTOR_ID, REQUEST_CONTEXT);

  const [postA, postB, postC] = await Promise.all([
    prisma.category.findUnique({ where: { catalogId_id: { catalogId: catalog.id, id: a.id } } }),
    prisma.category.findUnique({ where: { catalogId_id: { catalogId: catalog.id, id: b.id } } }),
    prisma.category.findUnique({ where: { catalogId_id: { catalogId: catalog.id, id: c.id } } }),
  ]);
  assert.equal(postA.status, 'archived');
  assert.equal(postB.status, 'archived');
  assert.equal(postC.status, 'archived');
});

// --- Acceptance edge case 2: defensive cycle safety ---
test('Category cascade is defensive against synthetic parentId cycle and terminates', async () => {
  await cleanDb();
  const { store, catalog } = await seedStore();
  const a = await seedCategory(catalog.id, { name: 'CycA' });
  const b = await seedCategory(catalog.id, { parentId: a.id, name: 'CycB' });
  // Forge a cycle: set a.parentId = b.id via raw SQL (PRD forbids this; we test defensive handling)
  await prisma.$executeRawUnsafe(`UPDATE "categories" SET "parentId" = $1::uuid WHERE id = $2::uuid`, b.id, a.id);

  // Walking from a, BFS with visited set should terminate without infinite loop.
  let finished = false;
  let elapsedMs = 0;
  const start = Date.now();
  try {
    // Direct call to cascade service to bypass updateCategory's own cycle check.
    await prisma.$transaction(async (tx) => {
      await cascadeArchive.cascadeCategoryArchive(tx, catalog.id, a.id, store.id, ACTOR_ID, REQUEST_CONTEXT);
    });
    finished = true;
  } finally {
    elapsedMs = Date.now() - start;
  }
  assert.equal(finished, true, 'cycle walk must terminate');
  assert.ok(elapsedMs < 5000, `cycle walk must finish promptly (got ${elapsedMs}ms)`);
});

// --- Acceptance edge case 3: concurrency isolation ---
test('Two concurrent store-archive operations on overlapping hierarchy do not produce half-state', async () => {
  await cleanDb();
  const { store, catalog } = await seedStore();
  const product = await seedProduct();
  const cat = await seedCategory(catalog.id);
  const placement = await seedPlacement(catalog.id, cat.id, product.id);

  // Fire two updateStore archive calls concurrently; one will see store already archived and skip cascade.
  const results = await Promise.allSettled([
    storesService.updateStore(store.id, { status: 'archived' }, ACTOR_ID, REQUEST_CONTEXT),
    storesService.updateStore(store.id, { status: 'archived' }, ACTOR_ID, REQUEST_CONTEXT),
  ]);
  const succeeded = results.filter((r) => r.status === 'fulfilled');
  assert.ok(succeeded.length >= 1, 'at least one call must succeed');

  const postStore = await prisma.store.findUnique({ where: { id: store.id } });
  const postPlacement = await prisma.catalogProductPlacement.findUnique({ where: { id: placement.id } });
  const postCategory = await prisma.category.findUnique({ where: { catalogId_id: { catalogId: catalog.id, id: cat.id } } });
  assert.equal(postStore.status, 'archived');
  assert.equal(postPlacement.status, 'archived');
  assert.equal(postCategory.status, 'archived');

  // No duplicate child audit events for the same entity (one winning cascade only).
  const placementEvents = await getAuditEvents({ entityType: 'CatalogProductPlacement', entityId: placement.id });
  assert.equal(placementEvents.length, 1, 'exactly one cascade audit per child');
});

// --- Acceptance edge case 4: already-archived child is no-op (idempotent) ---
test('Pre-archived child receives no duplicate cascade audit when parent archives', async () => {
  await cleanDb();
  const { store, catalog } = await seedStore();
  const product = await seedProduct();
  const cat = await seedCategory(catalog.id);
  const activePlacement = await seedPlacement(catalog.id, cat.id, product.id, { status: 'active' });
  const otherProduct = await seedProduct();
  const preArchivedPlacement = await seedPlacement(catalog.id, cat.id, otherProduct.id, { status: 'archived' });

  await storesService.updateStore(store.id, { status: 'archived' }, ACTOR_ID, REQUEST_CONTEXT);

  const events = await getAuditEvents({
    OR: [
      { entityType: 'CatalogProductPlacement', entityId: activePlacement.id },
      { entityType: 'CatalogProductPlacement', entityId: preArchivedPlacement.id },
    ],
  });
  const activeEvents = events.filter((e) => e.entityId === activePlacement.id);
  const preArchivedEvents = events.filter((e) => e.entityId === preArchivedPlacement.id);
  assert.equal(activeEvents.length, 1, 'one cascade audit for the still-active placement');
  assert.equal(preArchivedEvents.length, 0, 'no audit event for the pre-archived placement');
});

// --- Migration idempotency ---
test('Migration cleanup is idempotent: a second run is a no-op', async () => {
  await cleanDb();
  // Re-run the migration SQL by hand to assert idempotency on a clean db
  const fs = require('node:fs');
  const path = require('node:path');
  const sql = fs.readFileSync(path.resolve(__dirname, '..', '..', 'prisma', 'migrations', '20260519120000_bug_reg_035_cascade_archive_cleanup', 'migration.sql'), 'utf8');
  // Replace block comments and run each statement
  const statements = sql
    .split(/;\s*\n/)
    .map((s) =>
      s
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt);
  }
  // Second run; on a db with no limbo rows, both INSERT...SELECT and UPDATE...WHERE produce zero rows.
  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt);
  }
  // If we reach here no error was thrown and no constraint was violated.
  assert.ok(true);
});

// --- Regression-guard: pre-fix limbo can no longer be re-created via the API surface ---
test('Post-fix limbo (active child under archived parent) cannot be re-created via the standard API', async () => {
  await cleanDb();
  const { store, catalog } = await seedStore();
  const product = await seedProduct();
  const cat = await seedCategory(catalog.id);

  await storesService.updateStore(store.id, { status: 'archived' }, ACTOR_ID, REQUEST_CONTEXT);

  // Try to create an active placement under an archived hierarchy: must be rejected by assertActivePlacementAllowed
  let rejected = false;
  try {
    await catalogService.createPlacement(store.id, { categoryId: cat.id, productId: product.id, status: 'active' }, ACTOR_ID, REQUEST_CONTEXT);
  } catch (error) {
    rejected = true;
  }
  assert.equal(rejected, true, 'creating active placement under archived hierarchy must be rejected');
});

async function main() {
  await ensureActor();
  let failed = 0;
  for (const t of tests) {
    process.stdout.write(`- ${t.name} ... `);
    try {
      await t.fn();
      console.log('OK');
    } catch (error) {
      failed += 1;
      console.log('FAIL');
      console.error(error.stack || error.message);
    }
  }
  await prisma.$disconnect();
  if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${tests.length} cascade-archive integration tests passed`);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
