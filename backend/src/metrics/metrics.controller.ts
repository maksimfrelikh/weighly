import { Controller, Get, Res } from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async getMetrics(@Res() response: any) {
    const payload = await this.metrics.renderMetrics();
    response.setHeader('Content-Type', this.metrics.getContentType());
    response.send(payload);
  }
}
