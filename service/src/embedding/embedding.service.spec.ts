import { BadRequestException } from "@nestjs/common";
import { describe, it, expect, vi } from "vitest";

import { EmbeddingService } from "./embedding.service";
import { ProviderCapabilityNotImplementedError } from "../providers/base.provider";
import type { AiModelRecord } from "../types/runtime.types";

function makeModel(overrides: Partial<AiModelRecord> = {}): AiModelRecord {
  return {
    id: "model-1",
    providerId: null,
    modelCode: "embed-bge-m3-v2",
    modelName: "BGE M3 v2",
    provider: "doubao",
    endpointUrl: "https://api.doubao.example/v1",
    protocol: "openai",
    modelType: "embedding",
    description: null,
    contextWindow: null,
    maxOutputTokens: null,
    capabilities: ["embedding"],
    supportsStreaming: false,
    isActive: true,
    sort: 0,
    config: null,
    providerConfig: null,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    deletedAt: null,
    ...overrides,
  };
}

function makeService(model: AiModelRecord, providerOverrides: Partial<{
  embed: ReturnType<typeof vi.fn>;
}> = {}) {
  const registry = { getActiveModel: vi.fn().mockResolvedValue(model) };
  const quota = { assertAllowed: vi.fn().mockResolvedValue(undefined) };
  const provider = {
    embed:
      providerOverrides.embed ??
      vi.fn().mockRejectedValue(
        new ProviderCapabilityNotImplementedError("doubao", "embed"),
      ),
  };
  const router = { resolve: vi.fn().mockReturnValue(provider) };
  const providerKeys = { resolveKey: vi.fn().mockResolvedValue(null) };

  const requestLog = {
    record: vi.fn().mockResolvedValue(undefined),
    recordError: vi.fn().mockResolvedValue(undefined),
  };

  const service = new EmbeddingService(
    registry as never,
    router as never,
    quota as never,
    providerKeys as never,
    requestLog as never,
  );

  return { service, registry, quota, router, provider, providerKeys };
}

/** A verified service-mode token: tenant and workspace are different ids, on
 *  purpose - the grant axis is the tenant, the entitlement axis the workspace. */
const AUTH = {
  callerProductCode: "karda",
  mode: "service" as const,
  scope: "tool:atlas",
  tenantId: "tenant-1",
  workspaceId: "ws-1",
};

describe("EmbeddingService.embed", () => {
  it("rejects when modelCode is missing", async () => {
    const { service } = makeService(makeModel());
    await expect(
      service.embed({
        modelCode: "",
        texts: ["hi"],
        workspaceId: "ws-1",
      }, AUTH),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects when workspaceId is missing", async () => {
    const { service } = makeService(makeModel());
    await expect(
      service.embed({ modelCode: "m", texts: ["hi"], workspaceId: "" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects empty texts", async () => {
    const { service } = makeService(makeModel());
    await expect(
      service.embed({ modelCode: "m", texts: [], workspaceId: "ws-1" }, AUTH),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("gates through the model registry and quota before calling the provider", async () => {
    const model = makeModel();
    const { service, registry, quota } = makeService(model);

    await expect(
      service.embed({ modelCode: model.modelCode, texts: ["hi"], workspaceId: "ws-1" }, AUTH),
    ).rejects.toMatchObject({ code: "MODEL_NOT_IMPLEMENTED" });

    expect(registry.getActiveModel).toHaveBeenCalledWith(model.modelCode);
    // Asserts the gating contract - the model, and the TENANT the grant lookup
    // must use. TD-022: this previously asserted the workspace id, encoding the
    // defect as the contract, which is why no unit test caught it.
    const [gatedModel, gatedRequest] = quota.assertAllowed.mock.calls[0] as [
      unknown,
      { tenantId: string },
    ];
    expect(gatedModel).toEqual(model);
    expect(gatedRequest).toMatchObject({ tenantId: "tenant-1" });
  });

  it("maps a not-implemented provider to a 501 MODEL_NOT_IMPLEMENTED error", async () => {
    const model = makeModel();
    const { service } = makeService(model);

    try {
      await service.embed({
        modelCode: model.modelCode,
        texts: ["hi"],
        workspaceId: "ws-1",
      }, AUTH);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: "MODEL_NOT_IMPLEMENTED" });
      expect((error as { getStatus(): number }).getStatus()).toBe(501);
    }
  });

  it("returns the provider's embedding result on success", async () => {
    const model = makeModel();
    const embed = vi.fn().mockResolvedValue({
      modelVersion: "v2",
      dimension: 3,
      vectors: [[0.1, 0.2, 0.3]],
    });
    const { service } = makeService(model, { embed });

    const result = await service.embed({
      modelCode: model.modelCode,
      texts: ["hi"],
      workspaceId: "ws-1",
    }, AUTH);

    expect(result).toEqual({
      modelCode: model.modelCode,
      modelVersion: "v2",
      dimension: 3,
      vectors: [[0.1, 0.2, 0.3]],
    });
    expect(embed).toHaveBeenCalledWith(
      expect.objectContaining({ texts: ["hi"], modelCode: model.modelCode }),
    );
  });
});
