import { HttpStatus } from "@nestjs/common";

import { ModelRuntimeException } from "./runtime.errors";
import type { AiModelRecord } from "../types/runtime.types";

/** Providers whose api key is optional (endpoint-local auth, e.g. bearer baked into config). */
const API_KEY_OPTIONAL_PROVIDERS = new Set(["private", "custom", "self-hosted"]);

export function resolveApiKey(model: AiModelRecord, requestId?: string): string {
  const config = model.config as Record<string, unknown> | null;
  const apiKeyEnvVar =
    typeof config?.["apiKeyEnvVar"] === "string" ? config["apiKeyEnvVar"] : "";

  if (!apiKeyEnvVar) {
    return "";
  }

  const apiKey = process.env[apiKeyEnvVar];

  if (!apiKey && !API_KEY_OPTIONAL_PROVIDERS.has(model.provider)) {
    throw new ModelRuntimeException(
      HttpStatus.SERVICE_UNAVAILABLE,
      "PROVIDER_UNAVAILABLE",
      `Missing API key environment variable "${apiKeyEnvVar}" for model "${model.modelCode}"`,
      {
        ...(requestId !== undefined ? { requestId } : {}),
        modelCode: model.modelCode,
        provider: model.provider,
      },
    );
  }

  return apiKey ?? "";
}
