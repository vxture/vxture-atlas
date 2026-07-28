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

  // vxture-atlas naming plan (2026-07-28): live/ready/diagnostics used to be
  // duplicated under both bare /healthz and /model-platform/health/* - the
  // latter carried the leftover package-name prefix and was never anything
  // but a second name for the same three checks. Collapsed to one bare set;
  // /status (below) is unaffected since it never carried the prefix.
  @Get("healthz")
  live(): ModelPlatformLiveResponse {
    return this.health.live();
  }

  @Get("readyz")
  ready(): Promise<ModelPlatformReadyResponse> {
    return this.health.ready();
  }

  @Get("internal/diagnostics")
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
