const uuidSegmentPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const numericSegmentPattern = /^\d+$/;
const longHexSegmentPattern = /^[0-9a-f]{16,}$/i;

type MetricRequest = {
  baseUrl?: unknown;
  originalUrl?: unknown;
  path?: unknown;
  route?: {
    path?: unknown;
  };
  url?: unknown;
};

export function normalizeMetricRoute(value: string | undefined): string {
  const rawPath = (value ?? 'unknown').split('?')[0] || 'unknown';
  const normalizedPath = rawPath.replace(/\/+/g, '/').replace(/\/$/, '') || '/';

  return normalizedPath
    .split('/')
    .map((segment) => {
      if (!segment) {
        return segment;
      }

      if (uuidSegmentPattern.test(segment) || numericSegmentPattern.test(segment) || longHexSegmentPattern.test(segment)) {
        return ':id';
      }

      return segment;
    })
    .join('/');
}

export function resolveMetricRoute(request: MetricRequest): string {
  const routePath = typeof request.route?.path === 'string' ? request.route.path : '';
  const baseUrl = typeof request.baseUrl === 'string' ? request.baseUrl : '';
  if (routePath && routePath !== '*') {
    return normalizeMetricRoute(joinRoute(baseUrl, routePath));
  }

  const fallbackPath = firstString(request.path, request.originalUrl, request.url);
  return normalizeMetricRoute(fallbackPath);
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

function joinRoute(baseUrl: string, routePath: string): string {
  if (!baseUrl) {
    return routePath;
  }
  if (!routePath || routePath === '/') {
    return baseUrl;
  }

  return baseUrl.replace(/\/$/, '') + '/' + routePath.replace(/^\//, '');
}
