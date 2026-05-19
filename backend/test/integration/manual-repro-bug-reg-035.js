/* BUG-REG-035 §4.4 manual repro script — seeds pre-fix limbo, runs migration cleanup, asserts state. */
/* eslint-disable */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL must be set');
  process.exit(2);
}
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

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

function code(prefix) {
  return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

async function seedLimbo() {
  // pre-fix limbo: archived parent + active children, created via raw SQL to bypass cascade-archive service.
  const store = await prisma.store.create({ data: { code: code('STR'), name: 'Limbo Store', status: 'active' } });
  const catalog = await prisma.storeCatalog.create({ data: { storeId: store.id, name: 'cat', status: 'active' } });
  const product = await prisma.product.create({ data: { defaultPluCode: code('PLU'), name: 'P', shortName: 'P', unit: 'piece', status: 'active' } });
  const category = await prisma.category.create({ data: { catalogId: catalog.id, name: 'C', shortName: 'C', status: 'active' } });
  const placement = await prisma.catalogProductPlacement.create({ data: { catalogId: catalog.id, categoryId: category.id, productId: product.id, status: 'active' } });
  const banner = await prisma.advertisingBanner.create({ data: { storeId: store.id, imageUrl: 'x', status: 'active' } });
  const price = await prisma.storeProductPrice.create({ data: { storeId: store.id, productId: product.id, price: 10, currency: 'RUB', status: 'active' } });
  const device = await prisma.scaleDevice.create({ data: { storeId: store.id, deviceCode: code('SD'), apiTokenHash: 'h', name: 'd', status: 'active' } });

  // Flip parent only (legacy buggy behaviour) — leaves descendants in limbo.
  await prisma.store.update({ where: { id: store.id }, data: { status: 'archived' } });

  return { store, catalog, product, category, placement, banner, price, device };
}

async function runMigrationSql() {
  const sql = fs.readFileSync(path.resolve(__dirname, '..', '..', 'prisma', 'migrations', '20260519120000_bug_reg_035_cascade_archive_cleanup', 'migration.sql'), 'utf8');
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
  let updates = 0;
  for (const stmt of statements) {
    const affected = await prisma.$executeRawUnsafe(stmt);
    if (typeof affected === 'number') updates += affected;
  }
  return updates;
}

async function main() {
  console.log('STEP 1: Clean db');
  await cleanDb();

  console.log('STEP 2: Seed pre-fix limbo (archived store, active descendants — would be impossible post-fix via API)');
  const seeded = await seedLimbo();

  console.log('STEP 3: Verify limbo state pre-migration');
  const limboBefore = await prisma.catalogProductPlacement.findUnique({ where: { id: seeded.placement.id } });
  const limboPriceBefore = await prisma.storeProductPrice.findUnique({ where: { id: seeded.price.id } });
  const limboBannerBefore = await prisma.advertisingBanner.findUnique({ where: { id: seeded.banner.id } });
  const limboDeviceBefore = await prisma.scaleDevice.findUnique({ where: { id: seeded.device.id } });
  const limboCategoryBefore = await prisma.category.findUnique({ where: { catalogId_id: { catalogId: seeded.catalog.id, id: seeded.category.id } } });
  assert.equal(limboBefore.status, 'active');
  assert.equal(limboPriceBefore.status, 'active');
  assert.equal(limboBannerBefore.status, 'active');
  assert.equal(limboDeviceBefore.status, 'active');
  assert.equal(limboCategoryBefore.status, 'active');
  console.log('   ✓ all 5 child types are in limbo (active under archived store)');

  console.log('STEP 4: Run migration SQL');
  await runMigrationSql();

  console.log('STEP 5: Assert post-migration state');
  const limboAfter = await prisma.catalogProductPlacement.findUnique({ where: { id: seeded.placement.id } });
  const limboPriceAfter = await prisma.storeProductPrice.findUnique({ where: { id: seeded.price.id } });
  const limboBannerAfter = await prisma.advertisingBanner.findUnique({ where: { id: seeded.banner.id } });
  const limboDeviceAfter = await prisma.scaleDevice.findUnique({ where: { id: seeded.device.id } });
  const limboCategoryAfter = await prisma.category.findUnique({ where: { catalogId_id: { catalogId: seeded.catalog.id, id: seeded.category.id } } });
  assert.equal(limboAfter.status, 'archived');
  assert.equal(limboPriceAfter.status, 'archived');
  assert.equal(limboBannerAfter.status, 'archived');
  assert.equal(limboDeviceAfter.status, 'archived');
  assert.equal(limboCategoryAfter.status, 'archived');
  console.log('   ✓ all 5 child types cleaned to archived');

  console.log('STEP 6: Verify per-child cleanup audit events recorded');
  const events = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: 'Category', entityId: seeded.category.id },
        { entityType: 'CatalogProductPlacement', entityId: seeded.placement.id },
        { entityType: 'AdvertisingBanner', entityId: seeded.banner.id },
        { entityType: 'StoreProductPrice', entityId: seeded.price.id },
        { entityType: 'ScaleDevice', entityId: seeded.device.id },
      ],
    },
  });
  assert.equal(events.length, 5, `expected 5 audit events, got ${events.length}`);
  for (const event of events) {
    assert.equal(event.metadata?.cascade?.migration, 'bug-reg-035-cascade-archive-cleanup');
  }
  console.log('   ✓ 5 audit events with migration cascade metadata');

  console.log('STEP 7: Verify migration is idempotent (re-run produces 0 additional updates)');
  const eventsBeforeRerun = await prisma.auditLog.count();
  await runMigrationSql();
  const eventsAfterRerun = await prisma.auditLog.count();
  assert.equal(eventsAfterRerun, eventsBeforeRerun, 'idempotent: no duplicate audit rows');
  console.log('   ✓ idempotent');

  console.log('\n✅ §4.4 manual repro PASSED');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('❌ §4.4 manual repro FAILED');
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
