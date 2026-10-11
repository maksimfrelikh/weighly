import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsMiddleware } from './metrics.middleware';
import { MetricsService } from './metrics.service';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService, MetricsMiddleware],
})
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Express 5 (NestJS 11+) spells "every path" as {*path}; a bare '*' is only auto-converted with a warning.
    consumer.apply(MetricsMiddleware).forRoutes('{*path}');
  }
}
