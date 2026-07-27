/**
 * health.controller.ts - 模型平台健康检查入口
 * @package @vxture/service-model-platform
 * @layer Domain
 * @category controller
 * @author AI-Generated
 * @date 2026-06-06
 */

import { Controller, Get, Inject, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";

import {
  ModelPlatformHealthService,
  type ModelPlatformLiveResponse,
  type ModelPlatformReadyResponse,
} from "./health.service";
import { InternalDiagnosticsGuard } from "./guards/internal-diagnostics.guard";
import { renderStatusPage } from "./status-page";

@Controller()
export class HealthController {
  constructor(
    @Inject(ModelPlatformHealthService)
    private readonly health: ModelPlatformHealthService,
  ) {}

  @Get("healthz")
  check(): ModelPlatformLiveResponse {
    return this.health.live();
  }

  @Get("model-platform/health/live")
  live(): ModelPlatformLiveResponse {
    return this.health.live();
  }

  @Get("model-platform/health/ready")
  ready(): Promise<ModelPlatformReadyResponse> {
    return this.health.ready();
  }

  @Get("model-platform/health/diagnostics")
  @UseGuards(InternalDiagnosticsGuard)
  diagnostics(): Promise<ModelPlatformReadyResponse> {
    return this.health.diagnostics();
  }

  // Human-readable equivalent of karda/arda's portal /status page - same
  // gating as diagnostics (InternalDiagnosticsGuard), same underlying data
  // as health/ready, just rendered as HTML since Atlas has no portal to host
  // a Next.js page in.
  @Get("status")
  @UseGuards(InternalDiagnosticsGuard)
  async statusPage(@Res() res: Response): Promise<void> {
    const data = await this.health.ready();
    res.type("html").send(renderStatusPage(data));
  }
}
