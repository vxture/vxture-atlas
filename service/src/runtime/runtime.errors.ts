/**
 * runtime.errors.ts - Model Runtime 结构化错误
 * @package @atlas/service
 * @layer Domain
 * @category Runtime
 *
 * @description
 *   Runtime 对外返回稳定错误 code，避免调用方依赖异常文本解析。
 *
 * @author AI-Generated
 * @date 2026-06-06 20:00:00
 */

import { HttpException, HttpStatus } from "@nestjs/common";

// ============================================================================
// Types
// ============================================================================

export type ModelRuntimeErrorCode =
  | "MODEL_NOT_ROUTABLE"
  | "GRANT_DENIED"
  | "QUOTA_EXCEEDED"
  | "PROVIDER_UNAVAILABLE"
  | "MODEL_RUNTIME_REQUEST_FAILED"
  // S2S provider surface (A1 embed / A2 parse / A3 rerank, TD-003, docs/30-design/200-s2s-provider-surface.md).
  // Shared error envelope across A1-A4 per that doc's §1.1 (G1) - same class, wider code union.
  | "QUOTA_EXHAUSTED"
  | "RATE_LIMITED"
  | "CANDIDATE_POOL_TOO_LARGE"
  | "RERANK_UNAVAILABLE"
  | "MODEL_NOT_IMPLEMENTED"
  // Task-profile routing (docs/70-workplan) - no active grant matches the
  // requested taskProfile for this tenant/application.
  | "TASK_PROFILE_NOT_ROUTABLE"
  // tenantId/applicationId reaching a `uuid`-typed grant column must actually
  // be a UUID - a malformed value used to crash as an unhandled 500
  // (Postgres/Prisma UUID-cast error) instead of a clean 400.
  | "INVALID_TENANT_ID"
  | "INVALID_APPLICATION_ID";

export interface ModelRuntimeErrorResponse {
  code: ModelRuntimeErrorCode;
  message: string;
  requestId?: string;
  modelCode?: string;
  provider?: string;
  /** G1 (RATE_LIMITED, 429) - milliseconds until the caller should retry. */
  retryAfterMs?: number;
  /** G1 (QUOTA_EXHAUSTED, 403) - ISO8601 when quota resets, or null if unknown. */
  resetAt?: string | null;
}

// ============================================================================
// Exception
// ============================================================================

export class ModelRuntimeException extends HttpException {
  constructor(
    status: HttpStatus | number,
    readonly code: ModelRuntimeErrorCode,
    message: string,
    metadata: {
      requestId?: string;
      modelCode?: string;
      provider?: string;
      retryAfterMs?: number;
      resetAt?: string | null;
    } = {},
  ) {
    super(
      {
        code,
        message,
        ...(metadata.requestId !== undefined
          ? { requestId: metadata.requestId }
          : {}),
        ...(metadata.modelCode !== undefined
          ? { modelCode: metadata.modelCode }
          : {}),
        ...(metadata.provider !== undefined
          ? { provider: metadata.provider }
          : {}),
        ...(metadata.retryAfterMs !== undefined
          ? { retryAfterMs: metadata.retryAfterMs }
          : {}),
        ...(metadata.resetAt !== undefined
          ? { resetAt: metadata.resetAt }
          : {}),
      } satisfies ModelRuntimeErrorResponse,
      status,
    );
  }
}
