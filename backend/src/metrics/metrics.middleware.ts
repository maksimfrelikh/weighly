import { Injectable, NestMiddleware } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { resolveMetricRoute } from './metric-route.util';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(request: any, response: any, next: () => void): void {
    const startedAt = process.hrtime.bigint();

    response.on('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      this.metrics.recordHttpRequest(request.method, resolveMetricRoute(request), response.statusCode, durationSeconds);
    });

    next();
  }
}
