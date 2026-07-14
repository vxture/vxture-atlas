/**
 * metrics.controller.ts - 模型平台指标抓取入口
 * @package @vxture/service-model-platform
 * @layer Domain
 * @category controller
 * @author AI-Generated
 * @date 2026-06-07
 */
import { Controller, Get, Header, UseGuards } from "@nestjs/common";

import { metricsRegistry } from "./metrics.registry";
import { InternalDiagnosticsGuard } from "./guards/internal-diagnostics.guard";

@Controller()
export class MetricsController {
  @UseGuards(InternalDiagnosticsGuard)
  @Get("metrics")
  @Header("Content-Type", "text/plain; version=0.0.4")
  scrape(): Promise<string> {
    return metricsRegistry.scrape();
  }
}
