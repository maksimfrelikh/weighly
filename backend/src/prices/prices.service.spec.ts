import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// PricesService uses @Injectable() + parameter properties that node's
// TypeScript strip-only test runner cannot parse, so we import the compiled
// class from dist/. Same approach as scales.service.spec.ts.
import { PricesService } from '../../dist/prices/prices.service.js';

type PrismaCall = {
  model: string;
  method: string;
  args: unknown;
};

function buildPrismaStub(state: {
  catalog: { id: string; storeId: string; name: string; status: string } | null;
  categories: Array<{ id: string; name: string; shortName: string; status: string }>;
}) {
  const calls: PrismaCall[] = [];
  const prisma = {
    storeCatalog: {
      findFirst: async (args: unknown) => {
        calls.push({ model: 'storeCatalog', method: 'findFirst', args });
        return state.catalog;
      },
    },
    category: {
      findMany: async (args: unknown) => {
        calls.push({ model: 'category', method: 'findMany', args });
        return state.categories;
      },
    },
  } as never;
  return { prisma, calls };
}

describe('PricesService.listStorePriceCategories — BUG-REG-060', () => {
  const storeId = '11111111-1111-4111-8111-111111111111';
  const catalogId = '22222222-2222-4222-8222-222222222222';

  it('returns flat distinct active categories for the active catalog (happy path)', async () => {
    const { prisma, calls } = buildPrismaStub({
      catalog: { id: catalogId, storeId, name: 'Main', status: 'active' },
      categories: [
        { id: 'c1', name: 'Apples',   shortName: 'app', status: 'active' },
        { id: 'c2', name: 'Bananas',  shortName: 'ban', status: 'active' },
        { id: 'c3', name: 'Cherries', shortName: 'che', status: 'active' },
      ],
    });
    const service = new PricesService(prisma);

    const result = await service.listStorePriceCategories(storeId);

    assert.ok(Array.isArray(result), 'response must be a flat array (no envelope)');
    assert.equal(result.length, 3);
    assert.deepEqual(
      result.map((category: { id: string }) => category.id),
      ['c1', 'c2', 'c3'],
    );

    const findMany = calls.find((call) => call.model === 'category' && call.method === 'findMany');
    assert.ok(findMany, 'must query category.findMany');
    const where = (findMany.args as { where: Record<string, unknown> }).where;
    assert.equal(where.catalogId, catalogId, 'scoped to active catalog');
    assert.equal(where.status, 'active', 'only active categories surface in the dropdown');
    const placements = where.placements as { some: { status: string; product: { status: string } } };
    assert.equal(
      placements.some.status,
      'active',
      'only categories with at least one active placement surface',
    );
    assert.equal(
      placements.some.product.status,
      'active',
      'placement product must also be active (mirrors listStorePrices semantics)',
    );

    const select = (findMany.args as { select: Record<string, boolean> }).select;
    assert.deepEqual(
      select,
      { id: true, name: true, shortName: true, status: true },
      'selects the exact PriceCategory shape consumed by the FE dropdown',
    );

    const orderBy = (findMany.args as { orderBy: Record<string, string> }).orderBy;
    assert.deepEqual(orderBy, { name: 'asc' }, 'alphabetical for stable dropdown order');
  });

  it('throws NotFoundException when the store has no active catalog (auth-equivalent boundary on missing resource)', async () => {
    const { prisma } = buildPrismaStub({ catalog: null, categories: [] });
    const service = new PricesService(prisma);

    await assert.rejects(
      () => service.listStorePriceCategories(storeId),
      (error: Error) => {
        assert.equal(error.name, 'NotFoundException');
        assert.match(error.message, /Активный каталог магазина не найден/);
        return true;
      },
    );
  });

  it('rejects empty storeId via the shared findActiveCatalog normaliser (input boundary)', async () => {
    const { prisma } = buildPrismaStub({ catalog: null, categories: [] });
    const service = new PricesService(prisma);

    await assert.rejects(
      () => service.listStorePriceCategories(''),
      (error: Error) => {
        assert.equal(error.name, 'BadRequestException');
        assert.match(error.message, /ID магазина обязателен/);
        return true;
      },
    );
  });
});
