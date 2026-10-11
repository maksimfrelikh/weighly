import { Injectable } from '@nestjs/common';
import type { ScaleDevice, ScaleSyncLog, Store, StoreCatalog } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type DeviceWithDashboardRelations = ScaleDevice & {
  store: Pick<Store, 'id' | 'code' | 'name'>;
  syncLogs: Array<Pick<ScaleSyncLog, 'id' | 'status' | 'errorMessage' | 'requestedVersionId' | 'deliveredVersionId' | 'createdAt'>>;
};

type ActiveCatalogSummary = Pick<StoreCatalog, 'id' | 'storeId' | 'name' | 'currentVersionId'>;

type ProblemReason = 'latest_sync_error' | 'missing_sync' | 'outdated_catalog_version';

@Injectable()
export class DashboardService {
  private readonly dashboardListLimit = 10;

  constructor(private readonly prisma: PrismaService) {}

  async getAdminDashboard() {
    const [storeCount, scaleDeviceCount, latestPublishedVersions, activeCatalogs, devices] = await Promise.all([
      this.prisma.store.count(),
      this.prisma.scaleDevice.count(),
      this.getLatestPublishedVersions(),
      this.getActiveCatalogsByStore(),
      this.getDevicesForDashboard(),
    ]);

    const activeCatalogByStoreId = this.toFirstActiveCatalogByStoreId(activeCatalogs);
    const deviceStates = devices.map((device) => this.toDeviceState(device, activeCatalogByStoreId.get(device.storeId)));
    const devicesWithErrors = deviceStates
      .filter((state) => state.hasLatestSyncError)
      .sort((left, right) => this.compareProblematicDevices(left.device, right.device));
    const devicesWithoutSynchronization = deviceStates.filter((state) => state.isWithoutSynchronization);
    const problematicDeviceStates = deviceStates
      .filter((state) => state.problemReasons.length > 0)
      .sort((left, right) => this.compareProblematicDevices(left.device, right.device));

    return {
      counts: {
        stores: storeCount,
        scaleDevices: scaleDeviceCount,
        scaleDevicesWithErrors: devicesWithErrors.length,
        scaleDevicesWithoutSynchronization: devicesWithoutSynchronization.length,
      },
      latestPublishedVersions,
      latestSyncErrors: devicesWithErrors.slice(0, this.dashboardListLimit).map((state) => this.toLatestSyncErrorResponse(state.device)),
      problematicScaleDevices: problematicDeviceStates
        .slice(0, this.dashboardListLimit)
        .map((state) => this.toProblematicScaleDeviceResponse(state.device, state.problemReasons, state.activeCatalog)),
    };
  }

  private getLatestPublishedVersions() {
    return this.prisma.catalogVersion
      .findMany({
        where: { status: 'published' },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }, { versionNumber: 'desc' }, { id: 'asc' }],
        take: this.dashboardListLimit,
        select: {
          id: true,
          catalogId: true,
          storeId: true,
          versionNumber: true,
          status: true,
          publishedAt: true,
          createdAt: true,
          store: { select: { id: true, code: true, name: true } },
          catalog: { select: { id: true, name: true } },
        },
      })
      .then((versions) =>
        versions.map((version) => ({
          id: version.id,
          catalogId: version.catalogId,
          catalogName: version.catalog.name,
          storeId: version.storeId,
          storeCode: version.store.code,
          storeName: version.store.name,
          versionNumber: version.versionNumber,
          status: version.status,
          publishedAt: version.publishedAt?.toISOString() ?? null,
          createdAt: version.createdAt.toISOString(),
        })),
      );
  }

  private getActiveCatalogsByStore(): Promise<ActiveCatalogSummary[]> {
    return this.prisma.storeCatalog.findMany({
      where: { status: 'active' },
      orderBy: [{ storeId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        storeId: true,
        name: true,
        currentVersionId: true,
      },
    });
  }

  private getDevicesForDashboard(): Promise<DeviceWithDashboardRelations[]> {
    return this.prisma.scaleDevice.findMany({
      include: {
        store: { select: { id: true, code: true, name: true } },
        syncLogs: {
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 1,
          select: {
            id: true,
            status: true,
            errorMessage: true,
            requestedVersionId: true,
            deliveredVersionId: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ storeId: 'asc' }, { deviceCode: 'asc' }],
    });
  }

  private toFirstActiveCatalogByStoreId(activeCatalogs: ActiveCatalogSummary[]) {
    const activeCatalogByStoreId = new Map<string, ActiveCatalogSummary>();
    for (const catalog of activeCatalogs) {
      if (!activeCatalogByStoreId.has(catalog.storeId)) {
        activeCatalogByStoreId.set(catalog.storeId, catalog);
      }
    }

    return activeCatalogByStoreId;
  }

  private toDeviceState(device: DeviceWithDashboardRelations, activeCatalog: ActiveCatalogSummary | undefined) {
    const latestSyncLog = device.syncLogs[0] ?? null;
    const hasLatestSyncError = latestSyncLog?.status === 'error' || latestSyncLog?.status === 'auth_failed';
    const hasNoSynchronization = !device.currentCatalogVersionId || !device.lastSyncAt;
    const isOutdated = Boolean(
      activeCatalog?.currentVersionId && device.currentCatalogVersionId && device.currentCatalogVersionId !== activeCatalog.currentVersionId,
    );
    const problemReasons: ProblemReason[] = [];

    if (hasLatestSyncError) {
      problemReasons.push('latest_sync_error');
    }
    if (hasNoSynchronization) {
      problemReasons.push('missing_sync');
    }
    if (isOutdated) {
      problemReasons.push('outdated_catalog_version');
    }

    return {
      device,
      activeCatalog: activeCatalog ?? null,
      hasLatestSyncError,
      isWithoutSynchronization: hasNoSynchronization || isOutdated,
      problemReasons,
    };
  }

  private compareProblematicDevices(left: DeviceWithDashboardRelations, right: DeviceWithDashboardRelations): number {
    const leftDate = left.syncLogs[0]?.createdAt ?? left.updatedAt;
    const rightDate = right.syncLogs[0]?.createdAt ?? right.updatedAt;
    const dateComparison = rightDate.getTime() - leftDate.getTime();
    if (dateComparison !== 0) {
      return dateComparison;
    }

    return left.deviceCode.localeCompare(right.deviceCode);
  }

  private toLatestSyncErrorResponse(device: DeviceWithDashboardRelations) {
    const latestSyncLog = device.syncLogs[0];

    return {
      id: latestSyncLog.id,
      scaleDeviceId: device.id,
      deviceCode: device.deviceCode,
      deviceName: device.name,
      storeId: device.storeId,
      storeCode: device.store.code,
      storeName: device.store.name,
      status: latestSyncLog.status,
      message: this.redactSensitiveText(latestSyncLog.errorMessage),
      requestedVersionId: latestSyncLog.requestedVersionId,
      deliveredVersionId: latestSyncLog.deliveredVersionId,
      createdAt: latestSyncLog.createdAt.toISOString(),
    };
  }

  private toProblematicScaleDeviceResponse(
    device: DeviceWithDashboardRelations,
    reasons: ProblemReason[],
    activeCatalog: ActiveCatalogSummary | null,
  ) {
    const latestSyncLog = device.syncLogs[0] ?? null;
    const hasLatestSyncError = latestSyncLog?.status === 'error' || latestSyncLog?.status === 'auth_failed';

    return {
      id: device.id,
      storeId: device.storeId,
      storeCode: device.store.code,
      storeName: device.store.name,
      deviceCode: device.deviceCode,
      name: device.name,
      model: device.model,
      status: device.status,
      reasons,
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
      lastSyncAt: device.lastSyncAt?.toISOString() ?? null,
      currentCatalogVersionId: device.currentCatalogVersionId,
      expectedCatalogVersionId: activeCatalog?.currentVersionId ?? null,
      lastSyncStatus: latestSyncLog?.status ?? null,
      lastSyncError: hasLatestSyncError
        ? {
            id: latestSyncLog.id,
            status: latestSyncLog.status,
            message: this.redactSensitiveText(latestSyncLog.errorMessage),
            requestedVersionId: latestSyncLog.requestedVersionId,
            deliveredVersionId: latestSyncLog.deliveredVersionId,
            createdAt: latestSyncLog.createdAt.toISOString(),
          }
        : null,
      updatedAt: device.updatedAt.toISOString(),
    };
  }

  private redactSensitiveText(value: string | null): string | null {
    if (!value) {
      return null;
    }

    return value
      .replace(/(apiToken\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
      .replace(/(api_token\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
      .replace(/(token\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
      .replace(/(password\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
      .slice(0, 1000);
  }
}
