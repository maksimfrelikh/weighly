import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';

// The services are @Injectable() with parameter properties — node's TypeScript
// strip-only runner cannot parse them, so we import the compiled classes from
// dist/. Run `npm run build` before this spec. The Prisma namespace comes from
// dist/ too: the package builder reads prices as Prisma.Decimal.
import { Prisma } from '../../dist/generated/prisma/client.js';
import { FilesService } from '../../dist/files/files.service.js';
import { ProductsService } from '../../dist/products/products.service.js';
import { CatalogPackageService } from '../../dist/publishing/catalog-package.service.js';

// BUG-REG-073 — product images reached the published catalog package as
// root-relative paths. ProductForm sent the upload's fileAsset.publicUrl
// (/uploads/images/<uuid>.<ext>) as the product's imageUrl, ProductsService
// stored any string, and CatalogPackageService copies it into items[].imageUrl
// as is. A scale gets only the package, and a path without a host is not a
// URL it can fetch.
//
// The fix: the form resolves publicUrl with resolveBackendUrl(), as the banner
// tab does since BUG-REG-072, and ProductsService takes only an empty imageUrl
// or an absolute http(s) URL, the rule banner images have had since BUG-REG-040.
// This spec walks the real services: upload → product → package.
const i18nStub = { t: (key: string) => key } as never;

const ACTOR_ID = '00000000-0000-4000-8000-000000000099';
const STORE_ID = '11111111-1111-4111-8111-111111111111';
const CATALOG_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const SITE_ORIGIN = 'https://weighly.example.test';
// The PNG signature is all FilesService's magic-byte check reads.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

const APPLES = { defaultPluCode: '1001', name: 'Яблоки красные весовые', shortName: 'Яблоки', unit: 'kg', status: 'active' };

function createMockPrisma() {
  const state = {
    fileAssets: [] as any[],
    products: [] as any[],
    auditLogs: [] as any[],
  };

  const tx = {
    fileAsset: {
      create: async ({ data }: any) => {
        const asset = {
          id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(state.fileAssets.length + 1).padStart(12, '0')}`,
          createdAt: new Date(),
          ...data,
        };
        state.fileAssets.push(asset);
        return asset;
      },
    },
    product: {
      create: async ({ data }: any) => {
        const { imageFileAsset, ...fields } = data;
        const product = {
          id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(state.products.length + 1).padStart(12, '0')}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...fields,
          imageFileAssetId: imageFileAsset?.connect?.id ?? null,
        };
        state.products.push(product);
        return { ...product };
      },
      update: async ({ where, data }: any) => {
        const product = state.products.find((row) => row.id === where.id);
        const { imageFileAsset, ...fields } = data;
        Object.assign(product, fields, { updatedAt: new Date() });
        if (imageFileAsset?.connect) product.imageFileAssetId = imageFileAsset.connect.id;
        if (imageFileAsset?.disconnect) product.imageFileAssetId = null;
        return { ...product };
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        state.auditLogs.push(data);
        return { id: 'audit-' + state.auditLogs.length, ...data };
      },
    },
  };

  return {
    state,
    prisma: {
      product: {
        findUnique: async ({ where }: any) => {
          const product = state.products.find((row) => row.id === where.id);
          return product ? { ...product } : null;
        },
      },
      // The package reads: one active catalog, one category, every stored
      // product placed in it with an active price, no banners.
      storeCatalog: {
        findFirst: async () => ({
          id: CATALOG_ID,
          storeId: STORE_ID,
          name: 'Основной каталог',
          currentVersionId: null,
          store: { id: STORE_ID, code: 'STORE-001', name: 'Магазин 001' },
        }),
      },
      category: {
        findMany: async () => [{ id: CATEGORY_ID, parentId: null, name: 'Фрукты', shortName: 'Фрукты', sortOrder: 0 }],
      },
      catalogProductPlacement: {
        count: async () => 0,
        findMany: async () =>
          state.products.map((product, index) => ({
            id: `cccccccc-cccc-4ccc-8ccc-${String(index + 1).padStart(12, '0')}`,
            categoryId: CATEGORY_ID,
            productId: product.id,
            sortOrder: index,
            product: { ...product },
          })),
      },
      storeProductPrice: {
        findMany: async () =>
          state.products.map((product, index) => ({
            id: `dddddddd-dddd-4ddd-8ddd-${String(index + 1).padStart(12, '0')}`,
            productId: product.id,
            price: new Prisma.Decimal('129.99'),
            currency: 'RUB',
          })),
      },
      advertisingBanner: {
        findMany: async () => [],
      },
      $transaction: async (cb: any) => cb(tx),
    },
  };
}

// FilesService and ProductsService both write their audit row inside the
// transaction: auditLogs.create(tx, { data }).
const auditLogs = {
  create: async (client: any, args: any) => client.auditLog.create(args),
};

async function uploadProductImage() {
  const { prisma, state } = createMockPrisma();
  const files = new FilesService(prisma as any, auditLogs as any, i18nStub);
  const { fileAsset } = await files.uploadImage(
    { originalname: 'apples.png', buffer: PNG_BYTES, size: PNG_BYTES.length },
    ACTOR_ID,
    {},
  );
  // The cascade service is only used when a product is archived.
  const products = new ProductsService(prisma as any, auditLogs as any, {} as never, i18nStub);
  const packages = new CatalogPackageService(prisma as any, auditLogs as any, i18nStub);
  return { fileAsset, products, packages, state };
}

function assertImageUrlRefused(err: unknown) {
  assert.ok(err instanceof BadRequestException, `expected BadRequestException, got ${err}`);
  assert.equal((err as BadRequestException).message, 'errors.products.imageUrlMustBeHttpUrl');
  return true;
}

describe('BUG-REG-073 — product image from an upload, through to the published package', () => {
  let uploadDir: string;
  let previousUploadDir: string | undefined;

  before(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'bug-reg-073-'));
    previousUploadDir = process.env.FILE_UPLOAD_DIR;
    process.env.FILE_UPLOAD_DIR = uploadDir;
  });

  after(async () => {
    if (previousUploadDir === undefined) {
      delete process.env.FILE_UPLOAD_DIR;
    } else {
      process.env.FILE_UPLOAD_DIR = previousUploadDir;
    }
    await rm(uploadDir, { recursive: true, force: true });
  });

  it('the upload answers with a root-relative publicUrl, which does not parse as a URL on its own', async () => {
    const { fileAsset } = await uploadProductImage();

    assert.match(fileAsset.publicUrl, /^\/uploads\/images\/[0-9a-f-]{36}\.png$/);
    // A scale has no page to resolve it against: the GET in the 2026-10-28 smoke failed the same way.
    assert.throws(() => new URL(fileAsset.publicUrl), { code: 'ERR_INVALID_URL' });
  });

  it('createProduct refuses that path as is, and other values a scale cannot fetch, and writes nothing', async () => {
    const { fileAsset, products, state } = await uploadProductImage();

    for (const imageUrl of [fileAsset.publicUrl, 'apples.png', '//cdn.example.com/apples.png', 'javascript:alert(1)']) {
      await assert.rejects(
        () => products.createProduct({ ...APPLES, imageUrl, imageFileAssetId: fileAsset.id }, ACTOR_ID, {}),
        assertImageUrlRefused,
        `expected ${JSON.stringify(imageUrl)} to be refused`,
      );
    }

    assert.equal(state.products.length, 0);
  });

  it('updateProduct refuses that path too and leaves the stored imageUrl as it was', async () => {
    const { fileAsset, products, state } = await uploadProductImage();
    const { product } = await products.createProduct({ ...APPLES }, ACTOR_ID, {});

    await assert.rejects(
      () => products.updateProduct(product.id, { imageUrl: fileAsset.publicUrl, imageFileAssetId: fileAsset.id }, ACTOR_ID, {}),
      assertImageUrlRefused,
    );

    assert.equal(state.products[0].imageUrl, null);
    assert.equal(state.products[0].imageFileAssetId, null);
  });

  it('the path resolved against the site origin is stored, and the package carries it as a URL a scale can fetch', async () => {
    const { fileAsset, products, packages } = await uploadProductImage();
    const imageUrl = new URL(fileAsset.publicUrl, SITE_ORIGIN).href;

    const { product } = await products.createProduct({ ...APPLES, imageUrl, imageFileAssetId: fileAsset.id }, ACTOR_ID, {});
    assert.equal(product.imageUrl, `${SITE_ORIGIN}${fileAsset.publicUrl}`);
    assert.equal(product.imageFileAssetId, fileAsset.id);

    const { packageData } = await packages.generateActiveCatalogPackage(STORE_ID);
    const [item] = packageData.categories[0].items;
    assert.equal(item.productId, product.id);
    assert.equal(item.imageUrl, product.imageUrl);

    const fetched = new URL(item.imageUrl);
    assert.equal(fetched.origin, SITE_ORIGIN);
    assert.equal(fetched.pathname, fileAsset.publicUrl);
  });

  it('imageUrl stays optional: none, blank or cleared is stored as null', async () => {
    const { products, state } = await uploadProductImage();

    const { product: withoutImage } = await products.createProduct({ ...APPLES }, ACTOR_ID, {});
    const { product: blankImage } = await products.createProduct({ ...APPLES, defaultPluCode: '1002', imageUrl: '   ' }, ACTOR_ID, {});
    assert.equal(withoutImage.imageUrl, null);
    assert.equal(blankImage.imageUrl, null);

    const { product: withImage } = await products.createProduct(
      { ...APPLES, defaultPluCode: '1003', imageUrl: `${SITE_ORIGIN}/uploads/images/apples.png` },
      ACTOR_ID,
      {},
    );
    const { product: cleared } = await products.updateProduct(withImage.id, { imageUrl: '' }, ACTOR_ID, {});
    assert.equal(cleared.imageUrl, null);
    assert.equal(state.products.length, 3);
  });
});
