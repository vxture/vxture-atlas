import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import { ModelRegistryRepository } from "../registry/model-registry.repository";
import { ModelRegistryService } from "../registry/model-registry.service";
import { ModelRuntimeException } from "../runtime/runtime.errors";
import type { S2sAuthContext } from "../runtime/guards/s2s-auth.guard";
import type { AiModelRecord } from "../types/runtime.types";
import type {
  TenancyScope,
  TenancyUsageResponse,
  TenancyUsageRow,
} from "./tenancy.types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 366;

@Injectable()
export class TenancyService {
  constructor(
    @Inject(ModelRegistryService)
    private readonly registry: ModelRegistryService,
    @Inject(ModelRegistryRepository)
    private readonly repository: ModelRegistryRepository,
  ) {}

  /**
   * The single choke point for this namespace: turn the verified token into a
   * scope id. Nothing here consults the request. A caller asking for a scope
   * its token does not carry gets a 403, not someone else's data.
   */
  private resolveScopeId(auth: S2sAuthContext | undefined, scope: TenancyScope): string {
    const claim = scope === "tenant" ? auth?.tenantId : auth?.workspaceId;
    const claimName = scope === "tenant" ? "tenant_id/org_id" : "workspace_id";

    if (!claim?.trim()) {
      throw new ModelRuntimeException(
        HttpStatus.FORBIDDEN,
        "TENANCY_SCOPE_UNAVAILABLE",
        scope === "tenant"
          ? "this token carries no tenant identity (no tenant_id/org_id claim), so a tenant-level rollup cannot be authorized. The platform mints org_id only when an organization is active, so personal tenants currently have none - use scope=workspace, which is always available. Tracked in vxture-atlas#71."
          : `token carries no ${claimName} claim, so a ${scope}-scoped read cannot be authorized`,
      );
    }

    if (!UUID_PATTERN.test(claim)) {
      // Not a client error to surface as 400: the caller cannot fix a claim
      // the issuer minted. Fail closed rather than querying with a value the
      // uuid column would reject anyway.
      throw new ModelRuntimeException(
        HttpStatus.FORBIDDEN,
        "TENANCY_SCOPE_INVALID",
        `token ${claimName} claim is not a UUID`,
      );
    }

    return claim;
  }

  /** Models this workspace is actually entitled to call (active grants only). */
  listModels(auth: S2sAuthContext | undefined): Promise<AiModelRecord[]> {
    return this.registry.listModelsForTenant({
      tenantId: this.resolveScopeId(auth, "workspace"),
    });
  }

  /**
   * Usage from Atlas's own request log. Not a billing figure - the billing
   * basis is the platform's `usage_events` summed over the subscription
   * period; this answers "what actually ran".
   */
  async usage(
    auth: S2sAuthContext | undefined,
    query: { scope?: string; days?: string },
  ): Promise<TenancyUsageResponse> {
    const scope: TenancyScope = query.scope === "tenant" ? "tenant" : "workspace";
    const scopeId = this.resolveScopeId(auth, scope);
    const days = this.resolveDays(query.days);

    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

    const raw = await this.repository.aggregateReqlogUsage({
      scopeColumn: scope === "tenant" ? "tenant_id" : "workspace_id",
      scopeId,
      from,
      to,
    });

    const rows: TenancyUsageRow[] = raw.map((r) => ({
      modelCode: r.modelCode,
      providerCode: r.providerCode,
      requests: Number(r.requests),
      inputTokens: Number(r.inputTokens ?? 0n),
      outputTokens: Number(r.outputTokens ?? 0n),
      totalTokens: Number(r.totalTokens ?? 0n),
      errors: Number(r.errors),
    }));

    return {
      scope,
      scopeId,
      from: from.toISOString(),
      to: to.toISOString(),
      rows,
      source: "atlas.reqlog",
    };
  }

  private resolveDays(raw: string | undefined): number {
    if (raw === undefined) return DEFAULT_WINDOW_DAYS;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_WINDOW_DAYS) {
      throw new ModelRuntimeException(
        HttpStatus.BAD_REQUEST,
        "INVALID_WINDOW",
        `days must be an integer between 1 and ${MAX_WINDOW_DAYS}`,
      );
    }
    return parsed;
  }
}
