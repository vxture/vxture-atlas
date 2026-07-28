/**
 * Tenant self-service reads. One rule for the whole namespace: **scope comes
 * from the verified token, never from the caller**.
 *
 * `/v1/models?tenantId=` (the endpoint this supersedes) took the tenant id as
 * a caller-supplied query param, so any valid S2S token could enumerate any
 * tenant's entitlements - the gap recorded as TD-010's open follow-up, and the
 * same shape as `vxture-platform` TD-035. Deriving scope from `org_id` /
 * `workspace_id` closes it by construction rather than by validation.
 */

/**
 * Which tenancy level a read is answering at. The platform's own model:
 * workspace is the cost-accounting unit, tenant (org) is the rollup above it -
 * an operator of a tenant legitimately needs both views, so the namespace
 * serves both rather than picking one (owner decision 2026-07-28).
 */
export type TenancyScope = "workspace" | "tenant";

export interface TenancyUsageRow {
  /** `null` when the request predates a dimension being populated. */
  modelCode: string | null;
  providerCode: string | null;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  errors: number;
}

export interface TenancyUsageResponse {
  scope: TenancyScope;
  /** The id the scope actually resolved to, echoed so callers can confirm. */
  scopeId: string;
  from: string;
  to: string;
  rows: TenancyUsageRow[];
  /**
   * Atlas's own request log is the source here - not the platform's metering
   * kernel. It is authoritative for "what ran", never for billing; the billing
   * basis is the platform's `usage_events` (see
   * docs/30-design/210-usage-metering-and-history.md).
   */
  source: "atlas.reqlog";
}

/**
 * A grant as the tenant sees it: what this workspace may call and under what
 * routing conditions. Deliberately narrower than the operator view
 * (`/capability/grants`) - `reason` is an operator's internal justification
 * and does not belong on a tenant-facing surface.
 */
export interface TenancyGrantRow {
  id: string;
  modelId: string;
  applicationId: string | null;
  applicationType: string | null;
  agentId: string | null;
  taskProfile: string | null;
  priority: number;
  expiresAt: string | null;
  isActive: boolean;
}

/**
 * Entitlement as the tenant sees it, read from the platform's C2 envelope -
 * NOT from Atlas's legacy `tenant_subscription_quotas` mirror, which the DB
 * split left as a stub returning `[]` (TD-005). Serving that would render an
 * empty page indistinguishable from "no quota configured".
 */
export interface TenancyQuotaResponse {
  workspaceId: string;
  /** null when the platform could not be reached or is not configured. */
  tier: string | null;
  bundled: boolean;
  limits: Record<string, number>;
  pools: Array<{
    metric: string;
    limit: number;
    remaining: number;
    priority: number;
  }>;
  /**
   * Why the answer looks the way it does. `uncovered` is expected today:
   * atlas's plan catalog is an unpublished draft platform-side, so every
   * workspace legitimately resolves with no pools - which is a very different
   * fact from "we could not ask".
   */
  status: "covered" | "uncovered" | "unavailable";
}
