import { Module } from "@nestjs/common";

import { ModelRuntimeController } from "./runtime/runtime.controller";
import { ModelRuntimeService } from "./runtime/runtime.service";
import { HealthController } from "./runtime/health.controller";
import { AtlasHealthService } from "./runtime/health.service";
import { MetricsController } from "./runtime/metrics.controller";
import { ModelAdminController } from "./runtime/model-admin.controller";
import { ModelAdminService } from "./runtime/model-admin.service";
import { MeteringService } from "./metering/metering.service";
import { RequestLogService } from "./reqlog/request-log.service";
import { PlatformEntitlementClient } from "./platform/platform-entitlement.client";
import { TenancyController } from "./tenancy/tenancy.controller";
import { TenancyService } from "./tenancy/tenancy.service";
import { ClaudeProvider } from "./providers/claude.provider";
import { DoubaoProvider } from "./providers/doubao.provider";
import { ZhipuProvider } from "./providers/zhipu.provider";
import { OpenAiCompatibleProvider } from "./providers/openai-compatible.provider";
import { PrivateModelProvider } from "./providers/private.provider";
import { ModelRegistryRepository } from "./registry/model-registry.repository";
import { ModelRegistryService } from "./registry/model-registry.service";
import { ModelProbeService } from "./runtime/model-probe.service";
import { ModelRouterService } from "./router/model-router.service";
import { QuotaService } from "./quota/quota.service";
import { EmbeddingController } from "./embedding/embedding.controller";
import { EmbeddingService } from "./embedding/embedding.service";
import { RerankController } from "./rerank/rerank.controller";
import { RerankService } from "./rerank/rerank.service";
import { ParseController } from "./parse/parse.controller";
import { ParseService } from "./parse/parse.service";
import { ProvisioningWebhookController } from "./provisioning/provisioning-webhook.controller";
import { ProvisioningWebhookService } from "./provisioning/provisioning-webhook.service";
import { ProvisioningWebhookRepository } from "./provisioning/provisioning-webhook.repository";
import { ProviderKeyController } from "./provider-keys/provider-key.controller";
import { ProviderKeyService } from "./provider-keys/provider-key.service";
import { ProviderKeyRepository } from "./provider-keys/provider-key.repository";
import { DiscoveryController } from "./discovery/discovery.controller";
import { MetricsRegistry, metricsRegistry } from "./runtime/metrics.registry";

@Module({
  controllers: [
    ModelRuntimeController,
    ModelAdminController,
    HealthController,
    MetricsController,
    EmbeddingController,
    RerankController,
    ParseController,
    ProvisioningWebhookController,
    ProviderKeyController,
    DiscoveryController,
    TenancyController,
  ],
  providers: [
    // The process-wide singleton, not a fresh instance: MetricsController
    // scrapes `metricsRegistry` directly, so a Nest-constructed second
    // instance would collect the router's counters where nothing reads them.
    { provide: MetricsRegistry, useValue: metricsRegistry },
    ModelRuntimeService,
    AtlasHealthService,
    ModelAdminService,
    ModelRegistryRepository,
    ModelRegistryService,
    ModelRouterService,
    ModelProbeService,
    QuotaService,
    MeteringService,
    RequestLogService,
    PlatformEntitlementClient,
    TenancyService,
    OpenAiCompatibleProvider,
    DoubaoProvider,
    ZhipuProvider,
    ClaudeProvider,
    PrivateModelProvider,
    EmbeddingService,
    RerankService,
    ParseService,
    ProvisioningWebhookService,
    ProvisioningWebhookRepository,
    ProviderKeyService,
    ProviderKeyRepository,
  ],
  exports: [
    ModelRuntimeService,
    ModelAdminService,
    ModelRegistryService,
    ModelRouterService,
    QuotaService,
    MeteringService,
    RequestLogService,
    EmbeddingService,
    RerankService,
    ParseService,
    ProviderKeyService,
  ],
})
export class AtlasModule {}
