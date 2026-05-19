import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditLogService } from '../logs/audit-log.service';

export type CascadeContext = {
  ipAddress?: string;
  userAgent?: string;
};

export type CascadeOrigin = {
  entityType: 'Store' | 'Category' | 'Product';
  entityId: string;
  storeId?: string | null;
};

export type CascadeSummary = {
  correlationId: string;
  storeCatalogs: string[];
  categories: string[];
  placements: string[];
  prices: string[];
  banners: string[];
  scaleDevices: string[];
};

const MAX_CATEGORY_DEPTH = 3;

type TxClient = Prisma.TransactionClient;

@Injectable()
export class CascadeArchiveService {
  constructor(private readonly auditLogs: AuditLogService) {}

  async cascadeStoreArchive(
    tx: TxClient,
    storeId: string,
    actorUserId: string,
    context: CascadeContext,
  ): Promise<CascadeSummary> {
    const summary = this.emptySummary();
    const origin: CascadeOrigin = { entityType: 'Store', entityId: storeId, storeId };

    const catalogs = await tx.storeCatalog.findMany({
      where: { storeId },
      select: { id: true },
    });

    for (const catalog of catalogs) {
      await this.archiveAllCategoriesInCatalog(tx, catalog.id, storeId, actorUserId, context, origin, summary);
      await this.archiveAllPlacementsInCatalog(tx, catalog.id, storeId, actorUserId, context, origin, summary);
    }

    await this.archiveActiveStorePrices(tx, storeId, actorUserId, context, origin, summary);
    await this.archiveActiveStoreBanners(tx, storeId, actorUserId, context, origin, summary);
    await this.archiveActiveStoreDevices(tx, storeId, actorUserId, context, origin, summary);

    return summary;
  }

  async cascadeCategoryArchive(
    tx: TxClient,
    catalogId: string,
    categoryId: string,
    storeId: string,
    actorUserId: string,
    context: CascadeContext,
  ): Promise<CascadeSummary> {
    const summary = this.emptySummary();
    const origin: CascadeOrigin = { entityType: 'Category', entityId: categoryId, storeId };

    const descendantIds = await this.collectDescendantCategoryIds(tx, catalogId, categoryId);

    if (descendantIds.length > 0) {
      const descendants = await tx.category.findMany({
        where: { catalogId, id: { in: descendantIds }, status: { not: 'archived' } },
        select: { id: true, status: true },
      });

      for (const descendant of descendants) {
        await tx.category.update({
          where: { catalogId_id: { catalogId, id: descendant.id } },
          data: { status: 'archived' },
        });
        await this.writeChildAudit(tx, {
          actorUserId,
          action: 'category.archived',
          entityType: 'Category',
          entityId: descendant.id,
          storeId,
          beforeData: { status: descendant.status },
          afterData: { status: 'archived' },
          origin,
          correlationId: summary.correlationId,
          context,
        });
        summary.categories.push(descendant.id);
      }
    }

    const subtreeCategoryIds = [categoryId, ...descendantIds];
    const placements = await tx.catalogProductPlacement.findMany({
      where: { catalogId, categoryId: { in: subtreeCategoryIds }, status: { not: 'archived' } },
      select: { id: true, status: true },
    });

    for (const placement of placements) {
      await tx.catalogProductPlacement.update({ where: { id: placement.id }, data: { status: 'archived' } });
      await this.writeChildAudit(tx, {
        actorUserId,
        action: 'placement.archived',
        entityType: 'CatalogProductPlacement',
        entityId: placement.id,
        storeId,
        beforeData: { status: placement.status },
        afterData: { status: 'archived' },
        origin,
        correlationId: summary.correlationId,
        context,
      });
      summary.placements.push(placement.id);
    }

    return summary;
  }

  async cascadeProductArchive(
    tx: TxClient,
    productId: string,
    actorUserId: string,
    context: CascadeContext,
  ): Promise<CascadeSummary> {
    const summary = this.emptySummary();
    const origin: CascadeOrigin = { entityType: 'Product', entityId: productId, storeId: null };

    const placements = await tx.catalogProductPlacement.findMany({
      where: { productId, status: { not: 'archived' } },
      select: { id: true, status: true, catalogId: true },
    });
    const catalogStoreIds = await this.lookupCatalogStoreIds(tx, placements.map((p) => p.catalogId));

    for (const placement of placements) {
      await tx.catalogProductPlacement.update({ where: { id: placement.id }, data: { status: 'archived' } });
      await this.writeChildAudit(tx, {
        actorUserId,
        action: 'placement.archived',
        entityType: 'CatalogProductPlacement',
        entityId: placement.id,
        storeId: catalogStoreIds.get(placement.catalogId) ?? null,
        beforeData: { status: placement.status },
        afterData: { status: 'archived' },
        origin,
        correlationId: summary.correlationId,
        context,
      });
      summary.placements.push(placement.id);
    }

    const prices = await tx.storeProductPrice.findMany({
      where: { productId, status: { not: 'archived' } },
      select: { id: true, status: true, storeId: true },
    });

    for (const price of prices) {
      await tx.storeProductPrice.update({ where: { id: price.id }, data: { status: 'archived' } });
      await this.writeChildAudit(tx, {
        actorUserId,
        action: 'price.archived',
        entityType: 'StoreProductPrice',
        entityId: price.id,
        storeId: price.storeId,
        beforeData: { status: price.status },
        afterData: { status: 'archived' },
        origin,
        correlationId: summary.correlationId,
        context,
      });
      summary.prices.push(price.id);
    }

    return summary;
  }

  private async archiveAllCategoriesInCatalog(
    tx: TxClient,
    catalogId: string,
    storeId: string,
    actorUserId: string,
    context: CascadeContext,
    origin: CascadeOrigin,
    summary: CascadeSummary,
  ) {
    const categories = await tx.category.findMany({
      where: { catalogId, status: { not: 'archived' } },
      select: { id: true, status: true },
    });

    for (const category of categories) {
      await tx.category.update({
        where: { catalogId_id: { catalogId, id: category.id } },
        data: { status: 'archived' },
      });
      await this.writeChildAudit(tx, {
        actorUserId,
        action: 'category.archived',
        entityType: 'Category',
        entityId: category.id,
        storeId,
        beforeData: { status: category.status },
        afterData: { status: 'archived' },
        origin,
        correlationId: summary.correlationId,
        context,
      });
      summary.categories.push(category.id);
    }
  }

  private async archiveAllPlacementsInCatalog(
    tx: TxClient,
    catalogId: string,
    storeId: string,
    actorUserId: string,
    context: CascadeContext,
    origin: CascadeOrigin,
    summary: CascadeSummary,
  ) {
    const placements = await tx.catalogProductPlacement.findMany({
      where: { catalogId, status: { not: 'archived' } },
      select: { id: true, status: true },
    });

    for (const placement of placements) {
      await tx.catalogProductPlacement.update({ where: { id: placement.id }, data: { status: 'archived' } });
      await this.writeChildAudit(tx, {
        actorUserId,
        action: 'placement.archived',
        entityType: 'CatalogProductPlacement',
        entityId: placement.id,
        storeId,
        beforeData: { status: placement.status },
        afterData: { status: 'archived' },
        origin,
        correlationId: summary.correlationId,
        context,
      });
      summary.placements.push(placement.id);
    }
  }

  private async archiveActiveStorePrices(
    tx: TxClient,
    storeId: string,
    actorUserId: string,
    context: CascadeContext,
    origin: CascadeOrigin,
    summary: CascadeSummary,
  ) {
    const prices = await tx.storeProductPrice.findMany({
      where: { storeId, status: { not: 'archived' } },
      select: { id: true, status: true },
    });

    for (const price of prices) {
      await tx.storeProductPrice.update({ where: { id: price.id }, data: { status: 'archived' } });
      await this.writeChildAudit(tx, {
        actorUserId,
        action: 'price.archived',
        entityType: 'StoreProductPrice',
        entityId: price.id,
        storeId,
        beforeData: { status: price.status },
        afterData: { status: 'archived' },
        origin,
        correlationId: summary.correlationId,
        context,
      });
      summary.prices.push(price.id);
    }
  }

  private async archiveActiveStoreBanners(
    tx: TxClient,
    storeId: string,
    actorUserId: string,
    context: CascadeContext,
    origin: CascadeOrigin,
    summary: CascadeSummary,
  ) {
    const banners = await tx.advertisingBanner.findMany({
      where: { storeId, status: { not: 'archived' } },
      select: { id: true, status: true },
    });

    for (const banner of banners) {
      await tx.advertisingBanner.update({ where: { id: banner.id }, data: { status: 'archived' } });
      await this.writeChildAudit(tx, {
        actorUserId,
        action: 'advertising_banner.archived',
        entityType: 'AdvertisingBanner',
        entityId: banner.id,
        storeId,
        beforeData: { status: banner.status },
        afterData: { status: 'archived' },
        origin,
        correlationId: summary.correlationId,
        context,
      });
      summary.banners.push(banner.id);
    }
  }

  private async archiveActiveStoreDevices(
    tx: TxClient,
    storeId: string,
    actorUserId: string,
    context: CascadeContext,
    origin: CascadeOrigin,
    summary: CascadeSummary,
  ) {
    const devices = await tx.scaleDevice.findMany({
      where: { storeId, status: { not: 'archived' } },
      select: { id: true, status: true },
    });

    for (const device of devices) {
      await tx.scaleDevice.update({ where: { id: device.id }, data: { status: 'archived' } });
      await this.writeChildAudit(tx, {
        actorUserId,
        action: 'scale_device.archived',
        entityType: 'ScaleDevice',
        entityId: device.id,
        storeId,
        beforeData: { status: device.status },
        afterData: { status: 'archived' },
        origin,
        correlationId: summary.correlationId,
        context,
      });
      summary.scaleDevices.push(device.id);
    }
  }

  private async collectDescendantCategoryIds(
    tx: TxClient,
    catalogId: string,
    rootCategoryId: string,
  ): Promise<string[]> {
    const allCategories = await tx.category.findMany({
      where: { catalogId },
      select: { id: true, parentId: true },
    });
    const childrenByParent = new Map<string, string[]>();
    for (const category of allCategories) {
      if (!category.parentId) {
        continue;
      }
      const list = childrenByParent.get(category.parentId) ?? [];
      list.push(category.id);
      childrenByParent.set(category.parentId, list);
    }

    const descendants: string[] = [];
    const visited = new Set<string>([rootCategoryId]);
    const queue: { id: string; depth: number }[] = [{ id: rootCategoryId, depth: 1 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= MAX_CATEGORY_DEPTH) {
        continue;
      }
      const children = childrenByParent.get(current.id) ?? [];
      for (const childId of children) {
        if (visited.has(childId)) {
          continue;
        }
        visited.add(childId);
        descendants.push(childId);
        queue.push({ id: childId, depth: current.depth + 1 });
      }
    }

    return descendants;
  }

  private async lookupCatalogStoreIds(tx: TxClient, catalogIds: string[]): Promise<Map<string, string>> {
    if (catalogIds.length === 0) {
      return new Map();
    }
    const catalogs = await tx.storeCatalog.findMany({
      where: { id: { in: Array.from(new Set(catalogIds)) } },
      select: { id: true, storeId: true },
    });
    return new Map(catalogs.map((catalog) => [catalog.id, catalog.storeId]));
  }

  private async writeChildAudit(
    tx: TxClient,
    args: {
      actorUserId: string;
      action: string;
      entityType: string;
      entityId: string;
      storeId: string | null;
      beforeData: Prisma.InputJsonValue;
      afterData: Prisma.InputJsonValue;
      origin: CascadeOrigin;
      correlationId: string;
      context: CascadeContext;
    },
  ) {
    await this.auditLogs.create(tx, {
      data: {
        actorUserId: args.actorUserId,
        action: args.action,
        entityType: args.entityType,
        entityId: args.entityId,
        storeId: args.storeId,
        beforeData: args.beforeData,
        afterData: args.afterData,
        metadata: {
          cascade: {
            correlationId: args.correlationId,
            origin: { entityType: args.origin.entityType, entityId: args.origin.entityId },
            reason: 'parent.archive',
          },
        },
        ipAddress: args.context.ipAddress,
        userAgent: args.context.userAgent,
      },
    });
  }

  private emptySummary(): CascadeSummary {
    return {
      correlationId: randomUUID(),
      storeCatalogs: [],
      categories: [],
      placements: [],
      prices: [],
      banners: [],
      scaleDevices: [],
    };
  }
}
