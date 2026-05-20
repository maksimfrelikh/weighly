import { backendApi } from '../../shared/api/backendApi';
import type { PaginationMeta } from '../../shared/pagination/Pagination';

export type AuditLogEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  storeId: string | null;
  createdAt: string;
  actor: { id: string; email: string; fullName: string } | null;
  store: { id: string; code: string; name: string } | null;
};

export type ScaleSyncLogEntry = {
  id: string;
  scaleDeviceId: string | null;
  storeId: string | null;
  requestedVersionId: string | null;
  deliveredVersionId: string | null;
  status: 'no_update' | 'update_available' | 'package_delivered' | 'ack_received' | 'auth_failed' | 'error';
  errorMessage: string | null;
  createdAt: string;
  scaleDevice: { id: string; deviceCode: string; name: string } | null;
  store: { id: string; code: string; name: string } | null;
};

export type LogsFilters = {
  storeId?: string;
  entityType?: string;
  action?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
};

export type LogsResponse = {
  storeId?: string;
  auditLogs: { data: AuditLogEntry[]; meta: PaginationMeta };
  scaleSyncLogs: { data: ScaleSyncLogEntry[]; meta: PaginationMeta };
  filters: {
    storeId: string | null;
    entityType: string | null;
    action: string | null;
    status: string | null;
    dateFrom: string | null;
    dateTo: string | null;
    limit: number;
    offset: number;
  };
};

function buildQuery(filters: LogsFilters = {}) {
  const params = new URLSearchParams();
  if (filters.storeId) params.set('storeId', filters.storeId);
  if (filters.entityType) params.set('entityType', filters.entityType);
  if (filters.action) params.set('action', filters.action);
  if (filters.status) params.set('status', filters.status);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.offset) params.set('offset', String(filters.offset));
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const logsApi = backendApi.injectEndpoints({
  endpoints: (builder) => ({
    listGlobalLogs: builder.query<LogsResponse, LogsFilters | void>({
      query: (filters) => `/logs/global${buildQuery(filters ?? {})}`,
      providesTags: [{ type: 'Logs', id: 'GLOBAL' }],
    }),
    listStoreLogs: builder.query<LogsResponse, { storeId: string; filters?: Omit<LogsFilters, 'storeId'> }>({
      query: ({ storeId, filters }) => `/stores/${storeId}/logs${buildQuery(filters ?? {})}`,
      providesTags: (_result, _error, { storeId }) => [{ type: 'Logs', id: `STORE-${storeId}` }],
    }),
  }),
});

export const { useListGlobalLogsQuery, useListStoreLogsQuery } = logsApi;
