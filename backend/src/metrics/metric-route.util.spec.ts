import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeMetricRoute, resolveMetricRoute } from './metric-route.util.ts';

describe('metric route normalization - BUG-REG-054', () => {
  it('keeps stable static paths unchanged', () => {
    assert.equal(normalizeMetricRoute('/api/health'), '/api/health');
    assert.equal(normalizeMetricRoute('/api/metrics?format=prom'), '/api/metrics');
  });

  it('collapses UUID, numeric, and long-hex dynamic segments', () => {
    assert.equal(
      normalizeMetricRoute('/api/stores/11111111-1111-4111-8111-111111111111/scales/42'),
      '/api/stores/:id/scales/:id',
    );
    assert.equal(normalizeMetricRoute('/api/files/0123456789abcdef0123'), '/api/files/:id');
  });

  it('prefers the express route template when available', () => {
    assert.equal(
      resolveMetricRoute({ baseUrl: '/api/users', route: { path: '/:userId/store-accesses/:storeId' } }),
      '/api/users/:userId/store-accesses/:storeId',
    );
  });
});
