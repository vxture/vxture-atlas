import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";

import { ModelRegistryRepository } from "../registry/model-registry.repository";
import { ModelRuntimeException } from "../runtime/runtime.errors";
import type {
  AiModelRecord,
  ApplicationType,
  ChatRequest,
  QuotaCheckResult,
  TenantSubscriptionQuotaRecord,
} from "../types/runtime.types";

export const COMMERCE_SENTINEL_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * Synthetic quota used when the real quota source cannot be resolved (TD-002/TD-005 -
 * the C2 entitlement read is blocked on the platform's product.agent_catalog, see
 * ModelRegistryRepository.findCurrentSubscriptionQuota). `periodTokens: -1n` reuses this
 * file's own existing "unlimited" convention (see checkCommerceQuota). Model-level
 * allowedModels/allowCustomModel gating is deliberately NOT applied in this state - that
 * gating is quota-config-derived, and enforcing it against an unresolvable config would
 * silently and incorrectly deny every private/custom-provider request. Model-level
 * authorization has already happened via QuotaService.assertAllowed's earlier
 * ModelRegistryRepository.findBestGrant call (a real, working ModelGrant lookup) before
 * this synthetic quota is ever used.
 */
const FAIL_OPEN_QUOTA: TenantSubscriptionQuotaRecord = {
  id: COMMERCE_SENTINEL_UUID,
  tenantId: COMMERCE_SENTINEL_UUID,
  subscriptionId: null,
  maxUsers: 0,
  maxApiKeys: 0,
  maxWorkflows: 0,
  maxConcurrent: 0,
  rateLimitPerMinute: 0,
  periodTokens: -1n,
  quotaCycle: "unbounded",
  allowedModels: [],
  allowCustomModel: false,
  effectiveAt: new Date(0),
  expiresAt: null,
};

export interface QuotaContext {
  tenantId: string;
  applicationId: string;
  applicationType: ApplicationType;
  agentId: string;
  featureId: string;
  cycleMonth: string;
  quota: TenantSubscriptionQuotaRecord;
  remaining: bigint;
}

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(
    @Inject(ModelRegistryRepository)
    private readonly repository: ModelRegistryRepository,
  ) {}

  async assertAllowed(
    model: AiModelRecord,
    request: ChatRequest,
  ): Promise<QuotaContext> {
    const now = new Date();
    const applicationScope = resolveApplicationScope(request);
    const grant = await this.repository.findBestGrant(
      model.id,
      request.tenantId,
      applicationScope.applicationId,
      applicationScope.applicationType,
    );

    if (!grant) {
      throw new ModelRuntimeException(
        HttpStatus.FORBIDDEN,
        "GRANT_DENIED",
        "Current tenant or application has no technical grant for this model",
        { modelCode: model.modelCode },
      );
    }

    // Tenant-wide quota for now. Once the gateway→commerce mapping exists (#9),
    // resolve the request's per-app subscription and pass its id here to use the
    // per-subscription quota (the repository already prefers it when given).
    const quota = await this.repository.findCurrentSubscriptionQuota(
      request.tenantId,
      now,
    );

    const context = {
      tenantId: request.tenantId,
      applicationId: applicationScope.applicationId,
      applicationType: applicationScope.applicationType,
      agentId: applicationScope.agentId,
      featureId: normalizeUuidScope(request.featureId),
      cycleMonth: toCycleMonth(now),
    };

    // FAIL-OPEN (TD-002/TD-005): no quota source is resolvable yet (blocked on the
    // platform's product.agent_catalog - see FAIL_OPEN_QUOTA). Per the platform's own
    // documented doctrine (data_model_200_schema.md §3), an unavailable quota source
    // bounded-fail-opens the request rather than denying it or crashing. This is NOT the
    // same as "quota checked and found unlimited" - it means "quota could not be checked",
    // so model-allowlist gating from a synthetic quota is skipped entirely (see
    // FAIL_OPEN_QUOTA's own comment for why).
    if (!quota) {
      this.logger.warn(
        `quota check fail-open: no resolvable quota for tenant=${request.tenantId}, model=${model.modelCode} - allowing (TD-002/TD-005)`,
      );
      return { ...context, quota: FAIL_OPEN_QUOTA, remaining: -1n };
    }

    const commerceCheck = await this.checkCommerceQuota(
      model,
      request,
      quota,
      now,
    );

    if (!commerceCheck.allowed) {
      throw new ModelRuntimeException(
        HttpStatus.FORBIDDEN,
        "QUOTA_EXCEEDED",
        commerceCheck.reason ?? "AI model quota is exhausted",
        { modelCode: model.modelCode },
      );
    }

    return { ...context, quota, remaining: commerceCheck.remaining };
  }

  private async checkCommerceQuota(
    model: AiModelRecord,
    request: ChatRequest,
    quota: TenantSubscriptionQuotaRecord,
    now: Date,
  ): Promise<QuotaCheckResult> {
    if (!this.isModelAllowed(model, quota)) {
      return {
        allowed: false,
        reason: `Model "${model.modelCode}" is not allowed by current tenant subscription`,
        remaining: 0n,
      };
    }

    const cycleMonth = toCycleMonth(now);

    if (quota.periodTokens < 0n) {
      return {
        allowed: true,
        remaining: -1n,
      };
    }

    const summary = await this.repository.findUsageSummary({
      tenantId: request.tenantId,
      agentId: COMMERCE_SENTINEL_UUID,
      featureId: COMMERCE_SENTINEL_UUID,
      cycleMonth,
      statType: "summary",
    });
    const used = summary?.totalQuota ?? 0n;
    const remaining = quota.periodTokens - used;

    const isAllowed = remaining > 0n;
    return {
      allowed: isAllowed,
      ...(isAllowed
        ? {}
        : { reason: "Tenant subscription token quota is exhausted" }),
      remaining,
    };
  }

  private isModelAllowed(
    model: AiModelRecord,
    quota: TenantSubscriptionQuotaRecord,
  ): boolean {
    const modelExplicitlyAllowed = quota.allowedModels.includes(
      model.modelCode,
    );
    const platformDefaultAllowed =
      quota.allowedModels.length === 0 && !isPrivateProvider(model.provider);

    if (isPrivateProvider(model.provider)) {
      return quota.allowCustomModel || modelExplicitlyAllowed;
    }

    return platformDefaultAllowed || modelExplicitlyAllowed;
  }
}

export function normalizeUuidScope(value: string | undefined): string {
  return value?.trim() || COMMERCE_SENTINEL_UUID;
}

export function resolveApplicationScope(
  request: Pick<ChatRequest, "applicationId" | "applicationType" | "agentId">,
): {
  applicationId: string;
  applicationType: ApplicationType;
  agentId: string;
} {
  const applicationId = request.applicationId?.trim();
  const agentId = request.agentId?.trim();

  if (applicationId) {
    return {
      applicationId,
      applicationType: request.applicationType ?? "agent",
      agentId:
        request.applicationType === "agent"
          ? normalizeUuidScope(agentId ?? applicationId)
          : COMMERCE_SENTINEL_UUID,
    };
  }

  if (agentId) {
    return {
      applicationId: agentId,
      applicationType: "agent",
      agentId,
    };
  }

  return {
    applicationId: COMMERCE_SENTINEL_UUID,
    applicationType: "internal_service",
    agentId: COMMERCE_SENTINEL_UUID,
  };
}

export function toCycleMonth(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  return `${year}${month}`;
}

function isPrivateProvider(provider: string): boolean {
  return ["private", "custom", "self-hosted"].includes(provider);
}
