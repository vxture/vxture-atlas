import { HttpStatus } from "@nestjs/common";
import { describe, it, expect } from "vitest";

import { toS2sProviderError } from "./s2s-provider.shared";
import { ProviderCapabilityNotImplementedError } from "../providers/base.provider";
import { ModelRuntimeException } from "./runtime.errors";
import type { AiModelRecord } from "../types/runtime.types";

function makeModel(overrides: Partial<AiModelRecord> = {}): AiModelRecord {
  return {
    id: "model-1",
    providerId: null,
    modelCode: "m",
    modelName: "M",
    provider: "doubao",
    endpointUrl: "https://api.example.com",
    protocol: "openai",
    modelType: "embedding",
    description: null,
    contextWindow: null,
    maxOutputTokens: null,
    capabilities: [],
    supportsStreaming: false,
    isActive: true,
    sort: 0,
    config: null,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("toS2sProviderError", () => {
  it("passes an existing ModelRuntimeException through unchanged", () => {
    const original = new ModelRuntimeException(
      HttpStatus.FORBIDDEN,
      "GRANT_DENIED",
      "denied",
    );
    expect(toS2sProviderError(original, makeModel(), "req-1")).toBe(original);
  });

  it("maps ProviderCapabilityNotImplementedError to 501 MODEL_NOT_IMPLEMENTED", () => {
    const error = toS2sProviderError(
      new ProviderCapabilityNotImplementedError("doubao", "embed"),
      makeModel(),
      "req-1",
    );
    expect(error.code).toBe("MODEL_NOT_IMPLEMENTED");
    expect(error.getStatus()).toBe(HttpStatus.NOT_IMPLEMENTED);
  });

  it("maps an unknown error to 503 PROVIDER_UNAVAILABLE", () => {
    const error = toS2sProviderError(new Error("boom"), makeModel(), "req-1");
    expect(error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
