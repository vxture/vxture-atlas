import { HttpException, HttpStatus } from "@nestjs/common";

export type ProviderKeyErrorCode =
  | "PROVIDER_KEY_VALIDATION_FAILED"
  | "PROVIDER_KEY_NOT_FOUND";

export interface ProviderKeyErrorResponse {
  code: ProviderKeyErrorCode;
  message: string;
  field?: string;
  providerKeyId?: string;
}

export class ProviderKeyException extends HttpException {
  constructor(
    status: HttpStatus | number,
    readonly code: ProviderKeyErrorCode,
    message: string,
    metadata: { field?: string; providerKeyId?: string } = {},
  ) {
    super(
      {
        code,
        message,
        ...(metadata.field !== undefined ? { field: metadata.field } : {}),
        ...(metadata.providerKeyId !== undefined
          ? { providerKeyId: metadata.providerKeyId }
          : {}),
      } satisfies ProviderKeyErrorResponse,
      status,
    );
  }
}
