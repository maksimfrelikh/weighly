import { Injectable } from '@nestjs/common';
import { Prisma, ScaleSyncStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildMeta, parseLimit, parseOffset, type PaginationMeta } from '../shared/pagination';

type LogsQueryInput = {
  storeId?: string;
  entityType?: string;
  action?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: string;
  offset?: string;
};

const scaleSyncStatuses = new Set<string>(Object.values(ScaleSyncStatus));

type AuditLogResponse = ReturnType<LogsService['toAuditLogResponse']>;
type SyncLogResponse = ReturnType<LogsService['toScaleSyncLogResponse']>;

type LogsEnvelope = {
  auditLogs: { data: AuditLogResponse[]; meta: PaginationMeta };
  scaleSyncLogs: { data: SyncLogResponse[]; meta: PaginationMeta };
  filters: ReturnType<LogsService['echoFilters']>;
};

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  async listGlobalLogs(query: LogsQueryInput): Promise<LogsEnvelope> {
    const limit = parseLimit(query.limit);
    const offset = parseOffset(query.offset);
    const createdAt = this.buildDateFilter(query.dateFrom, query.dateTo);

    const auditWhere: Prisma.AuditLogWhereInput = {
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.entityType ? { entityType: { contains: query.entityType, mode: 'insensitive' } } : {}),
      ...(query.action ? { action: { contains: query.action, mode: 'insensitive' } } : {}),
      ...(createdAt ? { createdAt } : {}),
    };

    const syncWhere: Prisma.ScaleSyncLogWhereInput = {
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...this.buildSyncStatusFilter(query.status),
      ...(createdAt ? { createdAt } : {}),
    };

    const [auditLogs, auditTotal, syncLogs, syncTotal] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: auditWhere,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: this.auditLogSelect(),
      }),
      this.prisma.auditLog.count({ where: auditWhere }),
      this.prisma.scaleSyncLog.findMany({
        where: syncWhere,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: this.syncLogSelect(),
      }),
      this.prisma.scaleSyncLog.count({ where: syncWhere }),
    ]);

    return {
      auditLogs: {
        data: auditLogs.map((log) => this.toAuditLogResponse(log)),
        meta: buildMeta(auditTotal, limit, offset),
      },
      scaleSyncLogs: {
        data: syncLogs.map((log) => this.toScaleSyncLogResponse(log)),
        meta: buildMeta(syncTotal, limit, offset),
      },
      filters: this.echoFilters(query, limit, offset),
    };
  }

  async listStoreLogs(storeId: string, query: LogsQueryInput): Promise<LogsEnvelope & { storeId: string }> {
    const limit = parseLimit(query.limit);
    const offset = parseOffset(query.offset);
    const createdAt = this.buildDateFilter(query.dateFrom, query.dateTo);

    const auditWhere: Prisma.AuditLogWhereInput = {
      storeId,
      ...(query.entityType ? { entityType: { contains: query.entityType, mode: 'insensitive' } } : {}),
      ...(query.action ? { action: { contains: query.action, mode: 'insensitive' } } : {}),
      ...(createdAt ? { createdAt } : {}),
    };

    const syncWhere: Prisma.ScaleSyncLogWhereInput = {
      storeId,
      ...this.buildSyncStatusFilter(query.status),
      ...(createdAt ? { createdAt } : {}),
    };

    const [auditLogs, auditTotal, syncLogs, syncTotal] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: auditWhere,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: this.auditLogSelect(),
      }),
      this.prisma.auditLog.count({ where: auditWhere }),
      this.prisma.scaleSyncLog.findMany({
        where: syncWhere,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: this.syncLogSelect(),
      }),
      this.prisma.scaleSyncLog.count({ where: syncWhere }),
    ]);

    return {
      storeId,
      auditLogs: {
        data: auditLogs.map((log) => this.toAuditLogResponse(log)),
        meta: buildMeta(auditTotal, limit, offset),
      },
      scaleSyncLogs: {
        data: syncLogs.map((log) => this.toScaleSyncLogResponse(log)),
        meta: buildMeta(syncTotal, limit, offset),
      },
      filters: this.echoFilters(query, limit, offset),
    };
  }

  private auditLogSelect() {
    return {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      storeId: true,
      createdAt: true,
      actor: { select: { id: true, email: true, fullName: true } },
      store: { select: { id: true, code: true, name: true } },
    } satisfies Prisma.AuditLogSelect;
  }

  private syncLogSelect() {
    return {
      id: true,
      scaleDeviceId: true,
      storeId: true,
      requestedVersionId: true,
      deliveredVersionId: true,
      status: true,
      errorMessage: true,
      createdAt: true,
      scaleDevice: { select: { id: true, deviceCode: true, name: true } },
      store: { select: { id: true, code: true, name: true } },
    } satisfies Prisma.ScaleSyncLogSelect;
  }

  private toAuditLogResponse(log: Prisma.AuditLogGetPayload<{ select: ReturnType<LogsService['auditLogSelect']> }>) {
    return {
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      storeId: log.storeId,
      createdAt: log.createdAt.toISOString(),
      actor: log.actor ? { id: log.actor.id, email: log.actor.email, fullName: log.actor.fullName } : null,
      store: log.store ? { id: log.store.id, code: log.store.code, name: log.store.name } : null,
    };
  }

  private toScaleSyncLogResponse(log: Prisma.ScaleSyncLogGetPayload<{ select: ReturnType<LogsService['syncLogSelect']> }>) {
    return {
      id: log.id,
      scaleDeviceId: log.scaleDeviceId,
      storeId: log.storeId,
      requestedVersionId: log.requestedVersionId,
      deliveredVersionId: log.deliveredVersionId,
      status: log.status,
      errorMessage: log.errorMessage,
      createdAt: log.createdAt.toISOString(),
      scaleDevice: log.scaleDevice ? { id: log.scaleDevice.id, deviceCode: log.scaleDevice.deviceCode, name: log.scaleDevice.name } : null,
      store: log.store ? { id: log.store.id, code: log.store.code, name: log.store.name } : null,
    };
  }

  private buildSyncStatusFilter(status: string | undefined): Pick<Prisma.ScaleSyncLogWhereInput, 'status'> {
    return status && scaleSyncStatuses.has(status) ? { status: status as ScaleSyncStatus } : {};
  }

  private buildDateFilter(dateFrom?: string, dateTo?: string): Prisma.DateTimeFilter | undefined {
    const filter: Prisma.DateTimeFilter = {};
    const from = this.parseDate(dateFrom, false);
    const to = this.parseDate(dateTo, true);
    if (from) filter.gte = from;
    if (to) filter.lte = to;
    return Object.keys(filter).length > 0 ? filter : undefined;
  }

  private parseDate(value: string | undefined, endOfDay: boolean) {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    if (value.length === 10 && endOfDay) {
      date.setUTCHours(23, 59, 59, 999);
    }
    return date;
  }

  private echoFilters(query: LogsQueryInput, limit: number, offset: number) {
    return {
      storeId: query.storeId ?? null,
      entityType: query.entityType ?? null,
      action: query.action ?? null,
      status: query.status ?? null,
      dateFrom: query.dateFrom ?? null,
      dateTo: query.dateTo ?? null,
      limit,
      offset,
    };
  }
}
