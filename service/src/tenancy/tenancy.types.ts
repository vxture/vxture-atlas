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
