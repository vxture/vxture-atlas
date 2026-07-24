import { HttpStatus, Inject, Injectable } from "@nestjs/common";

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

    if (!quota) {
      throw new ModelRuntimeException(
        HttpStatus.FORBIDDEN,
        "QUOTA_EXCEEDED",
        "Current tenant has no active subscription quota",
        { modelCode: model.modelCode },
      );
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

    return {
      tenantId: request.tenantId,
      applicationId: applicationScope.applicationId,
      applicationType: applicationScope.applicationType,
      agentId: applicationScope.agentId,
      featureId: normalizeUuidScope(request.featureId),
      cycleMonth: toCycleMonth(now),
      quota,
      remaining: commerceCheck.remaining,
    };
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
