import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// MetricsService uses @Injectable() + parameter properties, so import the
// compiled class from dist/ after the CI build step.
import { MetricsService } from '../../dist/metrics/metrics.service.js';

describe('MetricsService - BUG-REG-054', () => {
  it('renders request metrics and read-only PostgreSQL connection gauges', async () => {
    let queryCount = 0;
    const prisma = {
      $queryRawUnsafe: async () => {
        queryCount += 1;
        if (queryCount === 1) {
          return [
            { state: 'active', count: 2 },
            { state: 'idle', count: 3 },
          ];
        }

        return [{ max_connections: 100 }];
      },
    };
    const service = new MetricsService(prisma as never);

    service.recordHttpRequest('GET', '/api/health', 200, 0.012);
    const metrics = await service.renderMetrics();

    assert.match(metrics, /scale_admin_http_requests_total\{[^}]*method="GET"[^}]*route="\/api\/health"[^}]*status_code="200"[^}]*\} 1/);
    assert.match(metrics, /scale_admin_http_request_duration_seconds_bucket/);
    assert.match(metrics, /scale_admin_db_up\{[^}]*\} 1/);
    assert.match(metrics, /scale_admin_db_connections\{[^}]*state="active"[^}]*\} 2/);
    assert.match(metrics, /scale_admin_db_connections\{[^}]*state="idle"[^}]*\} 3/);
    assert.match(metrics, /scale_admin_db_connections\{[^}]*state="total"[^}]*\} 5/);
    assert.match(metrics, /scale_admin_db_max_connections\{[^}]*\} 100/);
    assert.match(metrics, /scale_admin_db_connection_utilization_ratio\{[^}]*\} 0\.05/);
    assert.equal(service.getContentType(), 'text/plain; version=0.0.4; charset=utf-8');
  });

  it('keeps metrics endpoint available when PostgreSQL stats collection fails', async () => {
    const service = new MetricsService({
      $queryRawUnsafe: async () => {
        throw new Error('database unavailable');
      },
    } as never);

    const metrics = await service.renderMetrics();

    assert.match(metrics, /scale_admin_db_up\{[^}]*\} 0/);
  });
});
