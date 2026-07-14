/**
 * runtime.errors.ts - Model Runtime 结构化错误
 * @package @vxture/service-model-platform
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
  | "MODEL_RUNTIME_REQUEST_FAILED";

export interface ModelRuntimeErrorResponse {
  code: ModelRuntimeErrorCode;
  message: string;
  requestId?: string;
  modelCode?: string;
  provider?: string;
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
      } satisfies ModelRuntimeErrorResponse,
      status,
    );
  }
}
