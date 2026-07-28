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

  /** Authoritative dimensions, derived from the verified S2S token (rule 8). */
  workspaceId?: string | undefined;
  userId?: string | undefined;

  /** Caller-supplied scope, recorded as the grant/quota lookup actually used it. */
  tenantId?: string | undefined;
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
}

/** A failed request's provider/protocol detail (`reqlog.error_records`). */
export interface ErrorLogEntry {
  requestId: string;
  providerCode?: string | undefined;
  modelCode?: string | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
}
