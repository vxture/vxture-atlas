import type { ApplicationType } from "../types/runtime.types";

/**
 * One served request, as Atlas records it. Mirrors `reqlog.request_records`
 * (`deploy/database/ddl/00_baseline.sql`).
 *
 * Every field except `requestId`/`status` is optional on purpose: this is an
 * observability record, and a partially-attributed row is strictly more useful
 * than no row. Anything that cannot be established is written NULL rather than
 * guessed - see `request-log.service.ts` for the UUID coercion rule.
 */
export interface RequestLogEntry {
  requestId: string;
  status: "success" | "error" | "timeout";

  /**
   * Authoritative tenancy dimensions, derived from the verified S2S token
   * (rule 8). `tenantId` prefers the token's `org_id` claim over anything the
   * caller supplied: it is the rollup level for tenant-scoped views, and a
   * caller-asserted value is both untrustworthy and, in practice, often not a
   * UUID at all (karda's composite identifier, TD-010) - which would coerce to
   * NULL and leave the tenant dimension permanently empty.
   */
  tenantId?: string | undefined;
  workspaceId?: string | undefined;
  userId?: string | undefined;
  applicationId?: string | undefined;
  applicationType?: ApplicationType | undefined;
  agentId?: string | undefined;
  featureId?: string | undefined;

  /** Atlas domain facts. */
  modelCode?: string | undefined;
  providerCode?: string | undefined;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  totalTokens?: number | undefined;
  latencyMs?: number | undefined;
  usageType?: "normal" | "retry" | "test" | undefined;
  businessId?: string | undefined;

  /**
   * Set only when the C3 consume call actually landed (TD-017 part 2). Absent
   * means "served but not billed" - the reconciliation signal from
   * docs/30-design/210-usage-metering-and-history.md §4. `usageEventId` stays
   * unset regardless: the consume response does not return the event id, so
   * correlation is via `requestId`, which both sides carry.
   */
  billedMetricKey?: string | undefined;
  billedAmount?: number | undefined;
}

/** A failed request's provider/protocol detail (`reqlog.error_records`). */
export interface ErrorLogEntry {
  requestId: string;
  providerCode?: string | undefined;
  modelCode?: string | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
}
