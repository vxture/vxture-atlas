import { Module } from "@nestjs/common";

import { ModelRuntimeController } from "./runtime/runtime.controller";
import { ModelRuntimeService } from "./runtime/runtime.service";
import { HealthController } from "./runtime/health.controller";
import { ModelPlatformHealthService } from "./runtime/health.service";
import { MetricsController } from "./runtime/metrics.controller";
import { ModelAdminController } from "./runtime/model-admin.controller";
import { ModelAdminService } from "./runtime/model-admin.service";
import { MeteringService } from "./metering/metering.service";
import { ClaudeProvider } from "./providers/claude.provider";
import { DoubaoProvider } from "./providers/doubao.provider";
import { PrivateModelProvider } from "./providers/private.provider";
import { ModelRegistryRepository } from "./registry/model-registry.repository";
import { ModelRegistryService } from "./registry/model-registry.service";
import { ModelRouterService } from "./router/model-router.service";
import { QuotaService } from "./quota/quota.service";

@Module({
  controllers: [
    ModelRuntimeController,
    ModelAdminController,
    HealthController,
    MetricsController,
  ],
  providers: [
    ModelRuntimeService,
    ModelPlatformHealthService,
    ModelAdminService,
    ModelRegistryRepository,
    ModelRegistryService,
    ModelRouterService,
    QuotaService,
    MeteringService,
    DoubaoProvider,
    ClaudeProvider,
    PrivateModelProvider,
  ],
  exports: [
    ModelRuntimeService,
    ModelAdminService,
    ModelRegistryService,
    ModelRouterService,
    QuotaService,
    MeteringService,
  ],
})
export class ModelPlatformModule {}
