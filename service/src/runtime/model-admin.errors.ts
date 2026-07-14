/**
 * model-admin.errors.ts - Model Control Plane 结构化错误
 * @package @vxture/service-model-platform
 * @layer Domain
 * @category Runtime
 *
 * @description
 *   控制面 API 对 BFF 返回稳定错误 code，避免 BFF 和 Portal 依赖异常文本。
 *
 * @author AI-Generated
 * @date 2026-06-06 20:00:00
 */

import { HttpException, HttpStatus } from "@nestjs/common";

// ============================================================================
// Types
// ============================================================================

export type ModelAdminErrorCode =
  | "MODEL_ADMIN_VALIDATION_FAILED"
  | "MODEL_ADMIN_PROVIDER_NOT_FOUND"
  | "MODEL_ADMIN_MODEL_NOT_FOUND"
  | "MODEL_ADMIN_GRANT_NOT_FOUND"
  | "MODEL_ADMIN_POLICY_NOT_FOUND"
  | "MODEL_ADMIN_PRICE_RULE_NOT_FOUND"
  | "MODEL_ADMIN_SCOPE_INVALID";

export interface ModelAdminErrorResponse {
  code: ModelAdminErrorCode;
  message: string;
  field?: string;
  providerId?: string;
  modelId?: string;
  grantId?: string;
  policyId?: string;
  priceRuleId?: string;
}

// ============================================================================
// Exception
// ============================================================================

export class ModelAdminException extends HttpException {
  constructor(
    status: HttpStatus | number,
    readonly code: ModelAdminErrorCode,
    message: string,
    metadata: {
      field?: string;
      providerId?: string;
      modelId?: string;
      grantId?: string;
      policyId?: string;
      priceRuleId?: string;
    } = {},
  ) {
    super(
      {
        code,
        message,
        ...(metadata.field !== undefined ? { field: metadata.field } : {}),
        ...(metadata.providerId !== undefined
          ? { providerId: metadata.providerId }
          : {}),
        ...(metadata.modelId !== undefined
          ? { modelId: metadata.modelId }
          : {}),
        ...(metadata.grantId !== undefined
          ? { grantId: metadata.grantId }
          : {}),
        ...(metadata.policyId !== undefined
          ? { policyId: metadata.policyId }
          : {}),
        ...(metadata.priceRuleId !== undefined
          ? { priceRuleId: metadata.priceRuleId }
          : {}),
      } satisfies ModelAdminErrorResponse,
      status,
    );
  }
}
