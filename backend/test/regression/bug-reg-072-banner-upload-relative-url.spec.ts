import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';

// Both services are @Injectable() with parameter properties — node's
// TypeScript strip-only runner cannot parse them, so we import the compiled
// classes from dist/. Run `npm run build` before this spec.
import { AdvertisingService } from '../../dist/advertising/advertising.service.js';
import { FilesService } from '../../dist/files/files.service.js';

// BUG-REG-072 — the admin UI could not create a banner. AdvertisingTab uploads
// the file to POST /api/files/images and sent the answer's fileAsset.publicUrl
// as the banner's imageUrl. publicUrl is a root-relative path, and since
// BUG-REG-040 the banner API takes only an absolute http(s) URL, so every
// upload ended in 400 errors.advertising.imageUrlMustBeHttpUrl.
//
// The fix is in the frontend: resolveBackendUrl() in
// frontend/src/shared/api/backendApi.ts resolves publicUrl against the origin
// the file was uploaded to. The rule stays strict on purpose: imageUrl goes into
// the published package as is, and a scale cannot fetch a relative URL. This
// spec pins the backend half of that contract with the real services: the bare
// path is refused, the resolved URL creates the banner.
const i18nStub = { t: (key: string) => key } as never;

const ACTOR_ID = '00000000-0000-4000-8000-000000000099';
const STORE_ID = '11111111-1111-4111-8111-111111111111';
const SITE_ORIGIN = 'https://weighly.example.test';
// The PNG signature is all FilesService's magic-byte check reads.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

function createMockPrisma() {
  const state = {
    fileAssets: [] as any[],
    banners: [] as any[],
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
    advertisingBanner: {
      create: async ({ data }: any) => {
        const banner = {
          id: 'banner-' + (state.banners.length + 1),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.banners.push(banner);
        return banner;
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
      fileAsset: {
        findUnique: async ({ where }: any) => state.fileAssets.find((asset) => asset.id === where.id) ?? null,
      },
      $transaction: async (cb: any) => cb(tx),
    },
  };
}

// FilesService and AdvertisingService both write their audit row inside the
// transaction: auditLogs.create(tx, { data }).
const auditLogs = {
  create: async (client: any, args: any) => client.auditLog.create(args),
};

async function uploadBannerImage() {
  const { prisma, state } = createMockPrisma();
  const files = new FilesService(prisma as any, auditLogs as any, i18nStub);
  const { fileAsset } = await files.uploadImage(
    { originalname: 'banner.png', buffer: PNG_BYTES, size: PNG_BYTES.length },
    ACTOR_ID,
    {},
  );
  const advertising = new AdvertisingService(prisma as any, auditLogs as any, i18nStub);
  return { fileAsset, advertising, state };
}

describe('BUG-REG-072 — banner created from an uploaded image', () => {
  let uploadDir: string;
  let previousUploadDir: string | undefined;

  before(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'bug-reg-072-'));
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

  it('the upload answers with a root-relative publicUrl', async () => {
    const { fileAsset } = await uploadBannerImage();

    assert.match(fileAsset.publicUrl, /^\/uploads\/images\/[0-9a-f-]{36}\.png$/);
  });

  it('createBanner refuses that path as is — the 400 the tab showed — and writes nothing', async () => {
    const { fileAsset, advertising, state } = await uploadBannerImage();

    await assert.rejects(
      () =>
        advertising.createBanner(
          STORE_ID,
          { imageUrl: fileAsset.publicUrl, imageFileAssetId: fileAsset.id, status: 'active', sortOrder: 0 },
          ACTOR_ID,
          {},
        ),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException, `expected BadRequestException, got ${err}`);
        assert.equal((err as BadRequestException).message, 'errors.advertising.imageUrlMustBeHttpUrl');
        return true;
      },
    );

    assert.equal(state.banners.length, 0);
  });

  it('the same path resolved against the site origin creates the banner with that absolute URL', async () => {
    const { fileAsset, advertising, state } = await uploadBannerImage();
    const imageUrl = new URL(fileAsset.publicUrl, SITE_ORIGIN).href;

    const { banner } = await advertising.createBanner(
      STORE_ID,
      { imageUrl, imageFileAssetId: fileAsset.id, status: 'active', sortOrder: 0 },
      ACTOR_ID,
      {},
    );

    assert.equal(banner.imageUrl, `${SITE_ORIGIN}${fileAsset.publicUrl}`);
    assert.equal(banner.imageFileAssetId, fileAsset.id);
    assert.equal(state.banners.length, 1);
  });
});
