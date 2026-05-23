import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import { PrismaService } from '../prisma/prisma.service';

type DbConnectionRow = {
  state: string | null;
  count: bigint | number | string;
};

type DbMaxConnectionsRow = {
  max_connections: bigint | number | string;
};

const knownConnectionStates = ['active', 'idle', 'idle in transaction', 'fastpath function call', 'disabled', 'other'];

const connectionStatsSql =
  "SELECT COALESCE(state, 'other') AS state, COUNT(*)::int AS count " +
  'FROM pg_stat_activity ' +
  'WHERE datname = current_database() ' +
  "GROUP BY COALESCE(state, 'other')";

const maxConnectionsSql =
  'SELECT setting::int AS max_connections ' +
  'FROM pg_settings ' +
  "WHERE name = 'max_connections'";

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly httpRequestsTotal: Counter<string>;
  private readonly httpRequestDurationSeconds: Histogram<string>;
  private readonly dbUp: Gauge<string>;
  private readonly dbConnections: Gauge<string>;
  private readonly dbMaxConnections: Gauge<string>;
  private readonly dbConnectionUtilizationRatio: Gauge<string>;

  constructor(private readonly prisma: PrismaService) {
    this.registry.setDefaultLabels({ app: 'scale-admin-backend' });
    collectDefaultMetrics({
      prefix: 'scale_admin_process_',
      register: this.registry,
    });

    this.httpRequestsTotal = new Counter({
      name: 'scale_admin_http_requests_total',
      help: 'Total HTTP requests handled by the backend.',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: 'scale_admin_http_request_duration_seconds',
      help: 'HTTP request duration in seconds.',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.dbUp = new Gauge({
      name: 'scale_admin_db_up',
      help: 'Whether read-only PostgreSQL metrics collection succeeded: 1 for success, 0 for failure.',
      registers: [this.registry],
    });

    this.dbConnections = new Gauge({
      name: 'scale_admin_db_connections',
      help: 'PostgreSQL connections for the current database by state.',
      labelNames: ['state'],
      registers: [this.registry],
    });

    this.dbMaxConnections = new Gauge({
      name: 'scale_admin_db_max_connections',
      help: 'Configured PostgreSQL max_connections value.',
      registers: [this.registry],
    });

    this.dbConnectionUtilizationRatio = new Gauge({
      name: 'scale_admin_db_connection_utilization_ratio',
      help: 'Current-database connection count divided by PostgreSQL max_connections.',
      registers: [this.registry],
    });
  }

  getContentType(): string {
    return this.registry.contentType;
  }

  recordHttpRequest(method: string | undefined, route: string, statusCode: number | undefined, durationSeconds: number): void {
    const labels = {
      method: (method || 'UNKNOWN').toUpperCase(),
      route,
      status_code: String(statusCode ?? 0),
    };

    this.httpRequestsTotal.inc(labels);
    this.httpRequestDurationSeconds.observe(labels, durationSeconds);
  }

  async renderMetrics(): Promise<string> {
    await this.collectDatabaseMetrics();
    return this.registry.metrics();
  }

  private async collectDatabaseMetrics(): Promise<void> {
    try {
      const connectionRows = await this.prisma.$queryRawUnsafe<DbConnectionRow[]>(connectionStatsSql);
      const maxConnectionRows = await this.prisma.$queryRawUnsafe<DbMaxConnectionsRow[]>(maxConnectionsSql);

      const stateCounts = new Map<string, number>();
      for (const state of knownConnectionStates) {
        stateCounts.set(state, 0);
      }

      let total = 0;
      for (const row of connectionRows) {
        const state = normalizeDbState(row.state);
        const count = Number(row.count);
        if (!Number.isFinite(count)) {
          continue;
        }

        stateCounts.set(state, (stateCounts.get(state) ?? 0) + count);
        total += count;
      }

      for (const [state, count] of stateCounts) {
        this.dbConnections.set({ state }, count);
      }
      this.dbConnections.set({ state: 'total' }, total);

      const maxConnections = Number(maxConnectionRows[0]?.max_connections ?? 0);
      if (Number.isFinite(maxConnections) && maxConnections > 0) {
        this.dbMaxConnections.set(maxConnections);
        this.dbConnectionUtilizationRatio.set(total / maxConnections);
      }

      this.dbUp.set(1);
    } catch {
      this.dbUp.set(0);
    }
  }
}

function normalizeDbState(state: string | null): string {
  const normalizedState = (state ?? 'other').trim().toLowerCase();
  return knownConnectionStates.includes(normalizedState) ? normalizedState : 'other';
}
