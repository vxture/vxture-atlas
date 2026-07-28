import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import { ModelRegistryRepository } from "../registry/model-registry.repository";
import { PlatformEntitlementClient } from "../platform/platform-entitlement.client";
import { ModelRuntimeException } from "../runtime/runtime.errors";
import type { AiModelRecord, ApplicationType, ChatRequest } from "../types/runtime.types";

export const COMMERCE_SENTINEL_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * The subset of ChatRequest that quota/grant gating actually reads. Lets the A1/A2/A3
 * S2S provider endpoints (TD-003) reuse assertAllowed without needing a full chat-shaped
 * request (they have no `messages`/no `modelCode` on the request body itself - modelCode
 * is a separate parameter). ChatRequest still satisfies this structurally, so the chat
 * call sites (runtime.service.ts) are unaffected.
 */
export interface QuotaCheckRequest {
  tenantId: string;
  applicationId?: string;
  applicationType?: ApplicationType;
  agentId?: string;
  featureId?: string;
}

@Injectable()
export class QuotaService {
  constructor(
    @Inject(ModelRegistryRepository)
    private readonly repository: ModelRegistryRepository,
    @Inject(PlatformEntitlementClient)
    private readonly entitlements: PlatformEntitlementClient,
  ) {}

  /**
   * TD-016: consult the platform's C2 entitlement view.
   *
   * Three outcomes, deliberately not collapsed:
   *  - a real pool with nothing left  -> deny. The only case this gate can
   *    actually say no.
   *  - resolved but no coverage       -> allow, and say why. Atlas's plan
   *    catalog is still an unpublished draft on the platform side (confirmed
   *    in vxture-platform's seed-catalog.mjs: "empty features+quota - admin
   *    fills in once Atlas repo-split lands a product definition"), so every
   *    workspace legitimately reads as uncovered today; denying on that would
   *    take down live traffic (karda's included) for a bookkeeping gap.
   *  - unreachable / not configured   -> bounded fail-open, per the platform's
   *    own doctrine (data_model_200_schema.md §3).
   */
  private async checkEntitlement(
    model: AiModelRecord,
    workspaceId: string | undefined,
  ): Promise<void> {
    if (!workspaceId) return;

    const outcome = await this.entitlements.resolve(workspaceId);
    if (outcome.kind !== "resolved") return;

    const pools = outcome.view.quota_pools ?? [];
    if (pools.length === 0) return;

    const exhausted = pools.every((pool) => pool.remaining <= 0);
    if (exhausted) {
      throw new ModelRuntimeException(
        HttpStatus.FORBIDDEN,
        "QUOTA_EXCEEDED",
        "Workspace has no remaining quota for atlas",
        { modelCode: model.modelCode },
      );
    }
  }

  /**
   * Grant check (does this tenant/application have technical access to this
   * model at all) plus the C2 entitlement check above. Returns nothing - no
   * caller reads the result, only whether it throws.
   *
   * A previous version of this method also enforced a per-subscription token
   * quota and a model-allowlist sourced from
   * `ModelRegistryRepository.findCurrentSubscriptionQuota` /
   * `findUsageSummary`. Removed 2026-07-28 (TD-002/TD-005 cleanup): both
   * repository methods were stubs left over from the physical DB split that
   * always returned null/empty (their backing tables never existed in
   * Atlas's own database - they were cross-database reads into commerce
   * tables the platform owns), so that whole path was unreachable on every
   * call and always fell through to the fail-open branch below it. It also
   * modeled `allowedModels`/`allowCustomModel` per-subscription, a v1
   * "capabilities" concept the platform's own docs say is retired
   * (`entitlement-view.ts`: "union/tiered strategy keys ... no longer leave
   * the platform"). There is no real replacement for it to wire up - the C2
   * envelope's `limits` axis is the closest analog, and it carries the same
   * unpublished-plan-catalog gap as `quota_pools` above, so there was nothing
   * live to gate on either way.
   */
  async assertAllowed(
    model: AiModelRecord,
    request: QuotaCheckRequest,
    auth?: { workspaceId?: string | undefined },
  ): Promise<void> {
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

    await this.checkEntitlement(model, auth?.workspaceId);
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
