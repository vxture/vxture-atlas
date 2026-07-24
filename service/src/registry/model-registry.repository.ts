import { Injectable, Logger } from "@nestjs/common";

import {
  prisma,
  type AiModelRow,
  type QuotaPoolRow,
  type UsageSummaryRow,
} from "../prisma";
import type {
  AiModelGrantRecord,
  AiModelRecord,
  ApplicationType,
  CreateAiModelGrantInput,
  CreateAiModelInput,
  CreateModelPolicyInput,
  CreateModelPriceRuleInput,
  CreateModelProviderInput,
  ModelPolicyRecord,
  ModelPriceRuleRecord,
  ModelProviderRecord,
  TenantSubscriptionQuotaRecord,
  TenantUsageEventRecord,
  TenantUsageSummaryRecord,
  UpdateAiModelGrantInput,
  UpdateAiModelInput,
  UpdateModelPolicyInput,
  UpdateModelPriceRuleInput,
  UpdateModelProviderInput,
  UsageLogInput,
} from "../types/runtime.types";

const COMMERCE_SENTINEL_UUID = "00000000-0000-0000-0000-000000000000";

// model.models dropped the `provider` varchar column; provider identity is now the joined
// model_providers.provider_code. Every model read pulls it so AiModelRecord.provider stays populated.
const PROVIDER_INCLUDE = {
  providerRef: { select: { providerCode: true } },
} as const;

type UsagePersistenceInput = UsageLogInput & {
  applicationId: string;
  applicationType: ApplicationType;
  normalizedAgentId: string;
  normalizedFeatureId: string;
  cycleDate: Date;
  cycleMonth: string;
};

@Injectable()
export class ModelRegistryRepository {
  private readonly logger = new Logger(ModelRegistryRepository.name);

  checkDatabaseConnectivity(): Promise<void> {
    return prisma.$connect();
  }

  listProviders(includeInactive = false): Promise<ModelProviderRecord[]> {
    return prisma.modelProvider.findMany({
      where: includeInactive
        ? { deletedAt: null }
        : { isActive: true, deletedAt: null },
      orderBy: [
        { isActive: "desc" },
        { providerType: "asc" },
        { providerName: "asc" },
      ],
    });
  }

  findProviderById(providerId: string): Promise<ModelProviderRecord | null> {
    return prisma.modelProvider.findFirst({
      where: { id: providerId, deletedAt: null },
    });
  }

  createProvider(
    input: CreateModelProviderInput,
  ): Promise<ModelProviderRecord> {
    return prisma.modelProvider.create({ data: input });
  }

  updateProvider(
    providerId: string,
    input: UpdateModelProviderInput,
  ): Promise<ModelProviderRecord> {
    return prisma.modelProvider.update({
      where: { id: providerId },
      data: input,
    });
  }

  deleteProvider(providerId: string): Promise<ModelProviderRecord> {
    return prisma.modelProvider.update({
      where: { id: providerId },
      data: { isActive: false, deletedAt: new Date() },
    });
  }

  async findActiveModelByCode(
    modelCode: string,
  ): Promise<AiModelRecord | null> {
    const row = await prisma.modelDefinition.findFirst({
      where: {
        modelCode,
        isActive: true,
        deletedAt: null,
      },
      include: PROVIDER_INCLUDE,
    });

    return row ? mapAiModel(row) : null;
  }

  async listActiveModels(): Promise<AiModelRecord[]> {
    const rows = await prisma.modelDefinition.findMany({
      where: {
        isActive: true,
        deletedAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: PROVIDER_INCLUDE,
    });

    return rows.map(mapAiModel);
  }

  async listModels(includeInactive = false): Promise<AiModelRecord[]> {
    const rows = await prisma.modelDefinition.findMany({
      where: includeInactive
        ? { deletedAt: null }
        : { isActive: true, deletedAt: null },
      orderBy: [
        { isActive: "desc" },
        // provider column retired → order by the joined provider_code (was `provider` asc).
        { providerRef: { providerCode: "asc" } },
        { createdAt: "desc" },
      ],
      include: PROVIDER_INCLUDE,
    });

    return rows.map(mapAiModel);
  }

  async findModelById(modelId: string): Promise<AiModelRecord | null> {
    const row = await prisma.modelDefinition.findFirst({
      where: {
        id: modelId,
        deletedAt: null,
      },
      include: PROVIDER_INCLUDE,
    });

    return row ? mapAiModel(row) : null;
  }

  async createModel(input: CreateAiModelInput): Promise<AiModelRecord> {
    const row = await prisma.modelDefinition.create({
      data: stripRetiredProvider(input),
      include: PROVIDER_INCLUDE,
    });

    return mapAiModel(row);
  }

  async updateModel(
    modelId: string,
    input: UpdateAiModelInput,
  ): Promise<AiModelRecord> {
    const row = await prisma.modelDefinition.update({
      where: {
        id: modelId,
      },
      data: stripRetiredProvider(input),
      include: PROVIDER_INCLUDE,
    });

    return mapAiModel(row);
  }

  deleteGrant(grantId: string): Promise<AiModelGrantRecord> {
    return prisma.modelGrant.update({
      where: { id: grantId },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });
  }

  async deleteModel(modelId: string): Promise<AiModelRecord> {
    const deletedAt = new Date();

    return prisma.$transaction(async (tx) => {
      await tx.modelGrant.updateMany({
        where: {
          modelId,
          deletedAt: null,
        },
        data: {
          isActive: false,
          deletedAt,
        },
      });

      const row = await tx.modelDefinition.update({
        where: {
          id: modelId,
        },
        data: {
          isActive: false,
          deletedAt,
        },
        include: PROVIDER_INCLUDE,
      });

      return mapAiModel(row);
    });
  }

  async findBestGrant(
    modelId: string,
    tenantId: string,
    applicationId: string,
    applicationType: ApplicationType,
  ): Promise<AiModelGrantRecord | null> {
    const grants = await prisma.modelGrant.findMany({
      where: {
        modelId,
        tenantId,
        deletedAt: null,
        isActive: true,
        OR: [
          {
            applicationId,
            applicationType,
          },
          { applicationId: null, applicationType: null },
        ],
        AND: [
          {
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        ],
      },
      orderBy: [
        { applicationId: "desc" },
        { priority: "asc" },
        { createdAt: "desc" },
      ],
      take: 2,
    });

    return (
      grants.find(
        (grant) =>
          grant.applicationId === applicationId &&
          grant.applicationType === applicationType,
      ) ??
      grants.find(
        (grant) =>
          grant.applicationId === null && grant.applicationType === null,
      ) ??
      null
    );
  }

  listGrants(filters: {
    tenantId?: string;
    modelId?: string;
    applicationId?: string;
    applicationType?: ApplicationType;
  }): Promise<AiModelGrantRecord[]> {
    return prisma.modelGrant.findMany({
      where: {
        ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
        ...(filters.modelId ? { modelId: filters.modelId } : {}),
        ...(filters.applicationId
          ? { applicationId: filters.applicationId }
          : {}),
        ...(filters.applicationType
          ? { applicationType: filters.applicationType }
          : {}),
        deletedAt: null,
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });
  }

  findGrantById(grantId: string): Promise<AiModelGrantRecord | null> {
    return prisma.modelGrant.findFirst({
      where: {
        id: grantId,
        deletedAt: null,
      },
    });
  }

  createGrant(input: CreateAiModelGrantInput): Promise<AiModelGrantRecord> {
    return prisma.modelGrant.create({
      data: {
        modelId: input.modelId,
        tenantId: input.tenantId,
        applicationId: input.applicationId ?? input.agentId ?? null,
        applicationType:
          input.applicationType ?? (input.agentId ? "agent" : null),
        agentId: input.agentId ?? null,
        priority: input.priority ?? 100,
        reason: input.reason ?? null,
        expiresAt: input.expiresAt ?? null,
        isActive: input.isActive ?? true,
      },
    });
  }

  updateGrant(
    grantId: string,
    input: UpdateAiModelGrantInput,
  ): Promise<AiModelGrantRecord> {
    return prisma.modelGrant.update({
      where: {
        id: grantId,
      },
      data: input,
    });
  }

  listPriceRules(filters: {
    modelId?: string;
    includeInactive?: boolean;
  }): Promise<ModelPriceRuleRecord[]> {
    return prisma.modelPriceRule.findMany({
      where: {
        ...(filters.modelId ? { modelId: filters.modelId } : {}),
        ...(filters.includeInactive ? {} : { isActive: true }),
      },
      orderBy: [
        { isActive: "desc" },
        { effectiveAt: "desc" },
        { createdAt: "desc" },
      ],
    });
  }

  findPriceRuleById(priceRuleId: string): Promise<ModelPriceRuleRecord | null> {
    return prisma.modelPriceRule.findFirst({
      where: { id: priceRuleId },
    });
  }

  createPriceRule(
    input: CreateModelPriceRuleInput,
  ): Promise<ModelPriceRuleRecord> {
    return prisma.modelPriceRule.create({ data: input });
  }

  updatePriceRule(
    priceRuleId: string,
    input: UpdateModelPriceRuleInput,
  ): Promise<ModelPriceRuleRecord> {
    return prisma.modelPriceRule.update({
      where: { id: priceRuleId },
      data: input,
    });
  }

  listPolicies(filters: {
    modelId?: string;
    tenantId?: string;
    includeInactive?: boolean;
  }): Promise<ModelPolicyRecord[]> {
    return prisma.modelPolicy.findMany({
      where: {
        ...(filters.modelId ? { modelId: filters.modelId } : {}),
        ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
        ...(filters.includeInactive ? {} : { isActive: true }),
      },
      orderBy: [
        { isActive: "desc" },
        { priority: "asc" },
        { effectiveAt: "desc" },
      ],
    });
  }

  findPolicyById(policyId: string): Promise<ModelPolicyRecord | null> {
    return prisma.modelPolicy.findFirst({
      where: { id: policyId },
    });
  }

  createPolicy(input: CreateModelPolicyInput): Promise<ModelPolicyRecord> {
    return prisma.modelPolicy.create({ data: input });
  }

  updatePolicy(
    policyId: string,
    input: UpdateModelPolicyInput,
  ): Promise<ModelPolicyRecord> {
    return prisma.modelPolicy.update({
      where: { id: policyId },
      data: input,
    });
  }

  /**
   * Resolve the active quota for a tenant. When a subscription is resolved for
   * the request (per-app), prefer that subscription's pool; otherwise fall back
   * to the workspace-wide active pool.
   *
   * FLAG (metering restructure): the legacy commerce.tenant_subscription_quota is gone;
   * this now reads metering.quota_pools which is keyed by workspace_id (NOT tenant_id).
   * We treat the incoming `tenantId` as the workspace key as a documented stand-in until the
   * tenant→workspace resolution lands. Rows are projected onto the legacy record via mapQuotaPool.
   */
  async findCurrentSubscriptionQuota(
    tenantId: string,
    at: Date,
    subscriptionId?: string,
  ): Promise<TenantSubscriptionQuotaRecord | null> {
    const active = {
      effectiveAt: { lte: at },
      OR: [{ expiresAt: null }, { expiresAt: { gt: at } }],
    };
    const orderBy = [
      { effectiveAt: "desc" as const },
      { createdAt: "desc" as const },
    ];

    if (subscriptionId) {
      const scoped = await prisma.tenantSubscriptionQuota.findFirst({
        where: { workspaceId: tenantId, subscriptionId, ...active },
        orderBy,
      });
      if (scoped) return mapQuotaPool(scoped);
    }

    const wide = await prisma.tenantSubscriptionQuota.findFirst({
      where: { workspaceId: tenantId, ...active },
      orderBy,
    });

    return wide ? mapQuotaPool(wide) : null;
  }

  async listSubscriptionQuotas(filters: {
    tenantId?: string;
    includeExpired?: boolean;
  }): Promise<TenantSubscriptionQuotaRecord[]> {
    const now = new Date();

    // FLAG: tenantId filter mapped to workspace_id (quota_pools has no tenant_id column).
    const rows = await prisma.tenantSubscriptionQuota.findMany({
      where: {
        ...(filters.tenantId ? { workspaceId: filters.tenantId } : {}),
        ...(filters.includeExpired
          ? {}
          : { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }),
      },
      orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
    });

    return rows.map(mapQuotaPool);
  }

  /**
   * FLAG: metering.usage_summary_months has no agent/feature/statType dimensions; only
   * workspace_id + period_month are honored here (the other filters are dropped).
   */
  async findUsageSummary(input: {
    tenantId: string;
    agentId: string;
    featureId: string;
    cycleMonth: string;
    statType: string;
  }): Promise<TenantUsageSummaryRecord | null> {
    const row = await prisma.tenantUsageSummary.findFirst({
      where: { workspaceId: input.tenantId, periodMonth: input.cycleMonth },
    });

    return row ? mapUsageSummary(row) : null;
  }

  async listUsageSummaries(filters: {
    tenantId?: string;
    applicationId?: string;
    applicationType?: ApplicationType;
    cycleMonth?: string;
    statType?: string;
  }): Promise<TenantUsageSummaryRecord[]> {
    // FLAG: applicationId/applicationType/statType filters dropped (no equivalent columns in
    // usage_summary_months). Only workspace_id (from tenantId) + period_month are applied.
    const rows = await prisma.tenantUsageSummary.findMany({
      where: {
        ...(filters.tenantId ? { workspaceId: filters.tenantId } : {}),
        ...(filters.cycleMonth ? { periodMonth: filters.cycleMonth } : {}),
      },
      orderBy: [{ periodMonth: "desc" }],
    });

    return rows.map(mapUsageSummary);
  }

  /**
   * FLAG (usage write disabled post-cutover): metering.usage_events requires workspace_id +
   * product_id + metric_key, each with a real cross-schema FK (tenancy.workspaces / product.products),
   * plus an append-only guard trigger. This service only has tenantId and cannot satisfy those keys
   * yet, so writing bogus/sentinel ids would violate the FKs. Until the tenant→workspace / product /
   * metric mapping lands (commerce 域解耦重构), usage is not persisted. Chat requests still succeed;
   * usage is simply unmetered. Re-implement here against usage_events + usage_summary_* once the
   * mapping is available.
   */
  async recordUsage(
    _input: UsagePersistenceInput,
  ): Promise<TenantUsageEventRecord | null> {
    this.logger.warn(
      "usage metering skipped: metering.usage_events integration pending (needs workspace_id/product_id/metric_key mapping)",
    );
    return null;
  }

  /**
   * FLAG: summary write disabled post-cutover (same reason as recordUsage). Returns an in-memory
   * projection of the increment; nothing is persisted. Kept for API stability.
   */
  upsertUsageSummary(input: {
    tenantId: string;
    applicationId: string;
    applicationType: ApplicationType;
    agentId: string;
    featureId: string;
    cycleMonth: string;
    statType: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }): Promise<TenantUsageSummaryRecord> {
    return Promise.resolve({
      id: COMMERCE_SENTINEL_UUID,
      tenantId: input.tenantId,
      featureId: input.featureId,
      applicationId: input.applicationId,
      applicationType: input.applicationType,
      agentId: input.agentId,
      cycleMonth: input.cycleMonth,
      totalQuota: BigInt(input.usage.totalTokens),
      inputQuota: BigInt(input.usage.promptTokens),
      outputQuota: BigInt(input.usage.completionTokens),
      requestCount: 1n,
      statType: input.statType,
    });
  }
}

/** model.models row → AiModelRecord, deriving `provider` from the joined provider_code. */
function mapAiModel(row: AiModelRow): AiModelRecord {
  const { providerRef, ...rest } = row;
  return { ...rest, provider: providerRef?.providerCode ?? "" };
}

/** Drop the retired `provider` column before writing model.models. */
function stripRetiredProvider(
  input: CreateAiModelInput | UpdateAiModelInput,
): Record<string, unknown> {
  const data: Record<string, unknown> = { ...input };
  delete data["provider"];
  return data;
}

/**
 * metering.quota_pools row → legacy TenantSubscriptionQuotaRecord.
 * FLAG: quota_pools (workspace+product+metric multi-pool) has no 1:1 with the tenant-level
 * subscription quota. Fields with no new-schema equivalent are defaulted:
 *   maxUsers/maxApiKeys/maxWorkflows/maxConcurrent/rateLimitPerMinute → 0,
 *   allowedModels → [] and allowCustomModel → false (model gating now lives in model_grants),
 *   periodTokens ← quota_limit, tenantId ← workspace_id, quotaCycle ← reset_period.
 */
function mapQuotaPool(row: QuotaPoolRow): TenantSubscriptionQuotaRecord {
  return {
    id: row.id,
    tenantId: row.workspaceId,
    subscriptionId: row.subscriptionId,
    maxUsers: 0,
    maxApiKeys: 0,
    maxWorkflows: 0,
    maxConcurrent: 0,
    rateLimitPerMinute: 0,
    periodTokens: row.quotaLimit,
    quotaCycle: row.resetPeriod,
    allowedModels: [],
    allowCustomModel: false,
    effectiveAt: row.effectiveAt,
    expiresAt: row.expiresAt,
  };
}

/**
 * metering.usage_summary_months row → legacy TenantUsageSummaryRecord.
 * FLAG: no per application/agent/feature or input/output/request breakdown and no stat_type in
 * the new summary; those dimensions are defaulted. totalQuota ← total_amount,
 * tenantId ← workspace_id, cycleMonth ← period_month.
 */
function mapUsageSummary(row: UsageSummaryRow): TenantUsageSummaryRecord {
  return {
    id: row.id,
    tenantId: row.workspaceId,
    featureId: COMMERCE_SENTINEL_UUID,
    applicationId: COMMERCE_SENTINEL_UUID,
    applicationType: "internal_service",
    agentId: COMMERCE_SENTINEL_UUID,
    cycleMonth: row.periodMonth,
    totalQuota: row.totalAmount,
    inputQuota: 0n,
    outputQuota: 0n,
    requestCount: 0n,
    statType: "summary",
  };
}
