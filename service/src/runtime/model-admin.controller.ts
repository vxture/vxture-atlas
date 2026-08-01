import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";

import { OperatorAuthGuard } from "./guards/operator-auth.guard";
import {
  ModelAdminService,
  type AiModelAdminRecord,
  type AiModelGrantAdminRecord,
  type CreateAiModelBody,
  type CreateAiModelGrantBody,
  type CreateModelPolicyBody,
  type CreateModelPriceRuleBody,
  type CreateModelProviderBody,
  type ModelPolicyAdminRecord,
  type ModelPriceRuleAdminRecord,
  type ModelProviderAdminRecord,
  type ProtocolCatalogResponse,
  type TenantQuotaAdminRecord,
  type TenantUsageSummaryAdminRecord,
  type UpdateAiModelBody,
  type UpdateAiModelGrantBody,
  type UpdateModelPolicyBody,
  type UpdateModelPriceRuleBody,
  type UpdateModelProviderBody,
} from "./model-admin.service";
import { ModelProbeService } from "./model-probe.service";
import type { ModelProbeResult } from "./model-probe.service";
import type { ApplicationType } from "../types/runtime.types";

// vxture-atlas naming plan (2026-07-28, TD-013): "model-platform" was a
// leftover package name from the in-monorepo extraction, and "admin" now
// collides with platform's BSS-scoped meaning
// (product_250_management-plane-contract.md M-4 migrates this OSS
// "capability & service" domain out of admin-bff into capconsole-bff).
// /capability mirrors the already-decided Capability Console UI name.
// `model-platform/admin` retired outright (no alias, TD-013).
//
// Auth swapped from S2sAuthGuard to OperatorAuthGuard 2026-07-29 (#52, M-1):
// this namespace is operator-only now. console-bff's tenant-facing reads
// moved to /tenancy/* first (#70/#66) precisely so this swap would not break
// them - do not point a service-identity (tool:atlas) caller at this
// controller again.
@Controller("capability")
@UseGuards(OperatorAuthGuard)
export class ModelAdminController {
  constructor(
    @Inject(ModelAdminService) private readonly admin: ModelAdminService,
    @Inject(ModelProbeService) private readonly probe: ModelProbeService,
  ) {}

  /**
   * 可选的线协议及其 `wire` 默认值 —— 管理页面新增/编辑模型时的下拉数据源。
   * 纯静态、无租户数据，但仍在 operator 面下，因为它暴露的是内部适配器能力。
   */
  @Get("protocols")
  listProtocols(): ProtocolCatalogResponse {
    return this.admin.getProtocolCatalog();
  }

  @Get("providers")
  listProviders(
    @Query("includeInactive") includeInactive?: string,
  ): Promise<ModelProviderAdminRecord[]> {
    return this.admin.listProviders(includeInactive !== "false");
  }

  @Post("providers")
  createProvider(
    @Body() body: CreateModelProviderBody,
  ): Promise<ModelProviderAdminRecord> {
    return this.admin.createProvider(body);
  }

  @Put("providers/:providerId")
  updateProvider(
    @Param("providerId") providerId: string,
    @Body() body: UpdateModelProviderBody,
  ): Promise<ModelProviderAdminRecord> {
    return this.admin.updateProvider(providerId, body);
  }

  @Post("providers/:providerId/activate")
  activateProvider(
    @Param("providerId") providerId: string,
  ): Promise<ModelProviderAdminRecord> {
    return this.admin.setProviderActive(providerId, true);
  }

  @Post("providers/:providerId/deactivate")
  deactivateProvider(
    @Param("providerId") providerId: string,
  ): Promise<ModelProviderAdminRecord> {
    return this.admin.setProviderActive(providerId, false);
  }

  @Delete("providers/:providerId")
  deleteProvider(
    @Param("providerId") providerId: string,
  ): Promise<ModelProviderAdminRecord> {
    return this.admin.deleteProvider(providerId);
  }

  @Get("models")
  listModels(
    @Query("includeInactive") includeInactive?: string,
  ): Promise<AiModelAdminRecord[]> {
    return this.admin.listModels(includeInactive !== "false");
  }

  @Post("models")
  createModel(@Body() body: CreateAiModelBody): Promise<AiModelAdminRecord> {
    return this.admin.createModel(body);
  }

  @Put("models/:modelId")
  updateModel(
    @Param("modelId") modelId: string,
    @Body() body: UpdateAiModelBody,
  ): Promise<AiModelAdminRecord> {
    return this.admin.updateModel(modelId, body);
  }

  /**
   * 连通性自检。**会发起真实的上游调用并消耗 token**（上限 16），用量归平台
   * 哨兵、不扣任何租户配额（设计文档 §12.2）。
   */
  @Post("models/:modelId/probe")
  probeModel(
    @Param("modelId") modelId: string,
  ): Promise<ModelProbeResult> {
    return this.probe.probe(modelId);
  }

  @Post("models/:modelId/activate")
  activateModel(
    @Param("modelId") modelId: string,
  ): Promise<AiModelAdminRecord> {
    return this.admin.setModelActive(modelId, true);
  }

  @Post("models/:modelId/deactivate")
  deactivateModel(
    @Param("modelId") modelId: string,
  ): Promise<AiModelAdminRecord> {
    return this.admin.setModelActive(modelId, false);
  }

  @Delete("models/:modelId")
  deleteModel(@Param("modelId") modelId: string): Promise<AiModelAdminRecord> {
    return this.admin.deleteModel(modelId);
  }

  @Get("grants")
  listGrants(
    @Query("tenantId") tenantId?: string,
    @Query("modelId") modelId?: string,
    @Query("applicationId") applicationId?: string,
    @Query("applicationType") applicationType?: string,
  ): Promise<AiModelGrantAdminRecord[]> {
    return this.admin.listGrants({
      ...(tenantId !== undefined ? { tenantId } : {}),
      ...(modelId !== undefined ? { modelId } : {}),
      ...(applicationId !== undefined ? { applicationId } : {}),
      ...(applicationType !== undefined
        ? { applicationType: applicationType as ApplicationType }
        : {}),
    });
  }

  @Post("grants")
  createGrant(
    @Body() body: CreateAiModelGrantBody,
  ): Promise<AiModelGrantAdminRecord> {
    return this.admin.createGrant(body);
  }

  @Put("grants/:grantId")
  updateGrant(
    @Param("grantId") grantId: string,
    @Body() body: UpdateAiModelGrantBody,
  ): Promise<AiModelGrantAdminRecord> {
    return this.admin.updateGrant(grantId, body);
  }

  @Post("grants/:grantId/activate")
  activateGrant(
    @Param("grantId") grantId: string,
  ): Promise<AiModelGrantAdminRecord> {
    return this.admin.setGrantActive(grantId, true);
  }

  @Delete("grants/:grantId")
  deleteGrant(
    @Param("grantId") grantId: string,
  ): Promise<AiModelGrantAdminRecord> {
    return this.admin.deleteGrant(grantId);
  }

  @Get("price-rules")
  listPriceRules(
    @Query("modelId") modelId?: string,
    @Query("includeInactive") includeInactive?: string,
  ): Promise<ModelPriceRuleAdminRecord[]> {
    return this.admin.listPriceRules({
      ...(modelId !== undefined ? { modelId } : {}),
      ...(includeInactive !== undefined ? { includeInactive } : {}),
    });
  }

  @Post("price-rules")
  createPriceRule(
    @Body() body: CreateModelPriceRuleBody,
  ): Promise<ModelPriceRuleAdminRecord> {
    return this.admin.createPriceRule(body);
  }

  @Put("price-rules/:priceRuleId")
  updatePriceRule(
    @Param("priceRuleId") priceRuleId: string,
    @Body() body: UpdateModelPriceRuleBody,
  ): Promise<ModelPriceRuleAdminRecord> {
    return this.admin.updatePriceRule(priceRuleId, body);
  }

  @Post("price-rules/:priceRuleId/activate")
  activatePriceRule(
    @Param("priceRuleId") priceRuleId: string,
  ): Promise<ModelPriceRuleAdminRecord> {
    return this.admin.setPriceRuleActive(priceRuleId, true);
  }

  @Post("price-rules/:priceRuleId/deactivate")
  deactivatePriceRule(
    @Param("priceRuleId") priceRuleId: string,
  ): Promise<ModelPriceRuleAdminRecord> {
    return this.admin.setPriceRuleActive(priceRuleId, false);
  }

  @Get("policies")
  listPolicies(
    @Query("modelId") modelId?: string,
    @Query("tenantId") tenantId?: string,
    @Query("includeInactive") includeInactive?: string,
  ): Promise<ModelPolicyAdminRecord[]> {
    return this.admin.listPolicies({
      ...(modelId !== undefined ? { modelId } : {}),
      ...(tenantId !== undefined ? { tenantId } : {}),
      ...(includeInactive !== undefined ? { includeInactive } : {}),
    });
  }

  @Post("policies")
  createPolicy(
    @Body() body: CreateModelPolicyBody,
  ): Promise<ModelPolicyAdminRecord> {
    return this.admin.createPolicy(body);
  }

  @Put("policies/:policyId")
  updatePolicy(
    @Param("policyId") policyId: string,
    @Body() body: UpdateModelPolicyBody,
  ): Promise<ModelPolicyAdminRecord> {
    return this.admin.updatePolicy(policyId, body);
  }

  @Post("policies/:policyId/activate")
  activatePolicy(
    @Param("policyId") policyId: string,
  ): Promise<ModelPolicyAdminRecord> {
    return this.admin.setPolicyActive(policyId, true);
  }

  @Post("policies/:policyId/deactivate")
  deactivatePolicy(
    @Param("policyId") policyId: string,
  ): Promise<ModelPolicyAdminRecord> {
    return this.admin.setPolicyActive(policyId, false);
  }

  @Get("quotas")
  listTenantQuotas(
    @Query("tenantId") tenantId?: string,
    @Query("includeExpired") includeExpired?: string,
  ): Promise<TenantQuotaAdminRecord[]> {
    return this.admin.listTenantQuotas({
      ...(tenantId !== undefined ? { tenantId } : {}),
      ...(includeExpired !== undefined ? { includeExpired } : {}),
    });
  }

  @Get("usage-summaries")
  listUsageSummaries(
    @Query("tenantId") tenantId?: string,
    @Query("applicationId") applicationId?: string,
    @Query("applicationType") applicationType?: string,
    @Query("cycleMonth") cycleMonth?: string,
    @Query("statType") statType?: string,
  ): Promise<TenantUsageSummaryAdminRecord[]> {
    return this.admin.listUsageSummaries({
      ...(tenantId !== undefined ? { tenantId } : {}),
      ...(applicationId !== undefined ? { applicationId } : {}),
      ...(applicationType !== undefined
        ? { applicationType: applicationType as ApplicationType }
        : {}),
      ...(cycleMonth !== undefined ? { cycleMonth } : {}),
      ...(statType !== undefined ? { statType } : {}),
    });
  }
}
