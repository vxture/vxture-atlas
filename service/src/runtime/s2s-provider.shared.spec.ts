import { BadRequestException, HttpStatus } from "@nestjs/common";
import { describe, it, expect, vi } from "vitest";

import { resolveGatedModel, toS2sProviderError } from "./s2s-provider.shared";
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

function makeDeps(model: AiModelRecord) {
  const registry = {
    getActiveModel: vi.fn().mockResolvedValue(model),
    resolveModelCodeForTaskProfile: vi.fn().mockResolvedValue(model.modelCode),
  };
  const quota = { assertAllowed: vi.fn().mockResolvedValue(undefined) };
  const provider = {};
  const router = { resolve: vi.fn().mockReturnValue(provider) };
  const providerKeys = { resolveKey: vi.fn().mockResolvedValue(null) };

  return { registry, quota, router, provider, providerKeys };
}

describe("resolveGatedModel - task-profile routing", () => {
  it("uses modelCode directly when given, without consulting taskProfile resolution", async () => {
    const model = makeModel({ modelCode: "explicit-model" });
    const deps = makeDeps(model);

    const gated = await resolveGatedModel(deps as never, {
      modelCode: "explicit-model",
      tenantId: "tenant-1",
    });

    expect(gated.model).toBe(model);
    expect(deps.registry.resolveModelCodeForTaskProfile).not.toHaveBeenCalled();
    expect(deps.registry.getActiveModel).toHaveBeenCalledWith("explicit-model");
  });

  it("resolves modelCode from taskProfile when modelCode is omitted", async () => {
    const model = makeModel({ modelCode: "resolved-model" });
    const deps = makeDeps(model);

    const gated = await resolveGatedModel(deps as never, {
      taskProfile: "summarization",
      tenantId: "tenant-1",
      applicationId: "app-1",
      applicationType: "agent",
    });

    expect(deps.registry.resolveModelCodeForTaskProfile).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      taskProfile: "summarization",
      applicationId: "app-1",
      applicationType: "agent",
    });
    expect(gated.model).toBe(model);
  });

  it("rejects when neither modelCode nor taskProfile is given", async () => {
    const model = makeModel();
    const deps = makeDeps(model);

    await expect(
      resolveGatedModel(deps as never, { tenantId: "tenant-1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deps.registry.getActiveModel).not.toHaveBeenCalled();
  });
});
