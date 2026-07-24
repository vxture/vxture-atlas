import { BadRequestException } from "@nestjs/common";
import { describe, it, expect, vi } from "vitest";

import { RerankService } from "./rerank.service";
import { RERANK_CANDIDATE_POOL_LIMIT } from "./rerank.types";
import { ProviderCapabilityNotImplementedError } from "../providers/base.provider";
import type { AiModelRecord } from "../types/runtime.types";

function makeModel(overrides: Partial<AiModelRecord> = {}): AiModelRecord {
  return {
    id: "model-1",
    providerId: null,
    modelCode: "rerank-cross-encoder-v1",
    modelName: "Cross Encoder v1",
    provider: "doubao",
    endpointUrl: "https://api.doubao.example/v1",
    protocol: "openai",
    modelType: "rerank",
    description: null,
    contextWindow: null,
    maxOutputTokens: null,
    capabilities: ["rerank"],
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

function makeService(
  model: AiModelRecord,
  providerOverrides: Partial<{ rerank: ReturnType<typeof vi.fn> }> = {},
) {
  const registry = { getActiveModel: vi.fn().mockResolvedValue(model) };
  const quota = { assertAllowed: vi.fn().mockResolvedValue(undefined) };
  const provider = {
    rerank:
      providerOverrides.rerank ??
      vi
        .fn()
        .mockRejectedValue(
          new ProviderCapabilityNotImplementedError("doubao", "rerank"),
        ),
  };
  const router = { resolve: vi.fn().mockReturnValue(provider) };

  const service = new RerankService(
    registry as never,
    router as never,
    quota as never,
  );

  return { service, registry, quota, router, provider };
}

const CANDIDATES = [{ id: "c1", text: "candidate one" }];

describe("RerankService.rerank", () => {
  it("rejects when modelCode is missing", async () => {
    const { service } = makeService(makeModel());
    await expect(
      service.rerank({
        modelCode: "",
        query: "q",
        candidates: CANDIDATES,
        workspaceId: "ws-1",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects empty candidates", async () => {
    const { service } = makeService(makeModel());
    await expect(
      service.rerank({
        modelCode: "m",
        query: "q",
        candidates: [],
        workspaceId: "ws-1",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects candidate pools over the A3.2 limit with CANDIDATE_POOL_TOO_LARGE, not a silent truncation", async () => {
    const { service } = makeService(makeModel());
    const tooMany = Array.from(
      { length: RERANK_CANDIDATE_POOL_LIMIT + 1 },
      (_, i) => ({ id: `c${i}`, text: `candidate ${i}` }),
    );

    await expect(
      service.rerank({
        modelCode: "m",
        query: "q",
        candidates: tooMany,
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "CANDIDATE_POOL_TOO_LARGE" });
  });

  it("accepts exactly the pool limit", async () => {
    const model = makeModel();
    const rerank = vi.fn().mockResolvedValue({ scores: [{ id: "c0", score: 0.9 }] });
    const { service } = makeService(model, { rerank });
    const exactly100 = Array.from({ length: RERANK_CANDIDATE_POOL_LIMIT }, (_, i) => ({
      id: `c${i}`,
      text: `candidate ${i}`,
    }));

    await expect(
      service.rerank({
        modelCode: model.modelCode,
        query: "q",
        candidates: exactly100,
        workspaceId: "ws-1",
      }),
    ).resolves.toBeDefined();
  });

  it("rejects candidates missing id or text", async () => {
    const { service } = makeService(makeModel());
    await expect(
      service.rerank({
        modelCode: "m",
        query: "q",
        candidates: [{ id: "", text: "a" }],
        workspaceId: "ws-1",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("maps a not-implemented provider to a 501 MODEL_NOT_IMPLEMENTED error", async () => {
    const model = makeModel();
    const { service } = makeService(model);

    try {
      await service.rerank({
        modelCode: model.modelCode,
        query: "q",
        candidates: CANDIDATES,
        workspaceId: "ws-1",
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: "MODEL_NOT_IMPLEMENTED" });
      expect((error as { getStatus(): number }).getStatus()).toBe(501);
    }
  });

  it("returns the provider's scores on success", async () => {
    const model = makeModel();
    const rerank = vi
      .fn()
      .mockResolvedValue({ scores: [{ id: "c1", score: 0.42 }] });
    const { service } = makeService(model, { rerank });

    const result = await service.rerank({
      modelCode: model.modelCode,
      query: "q",
      candidates: CANDIDATES,
      workspaceId: "ws-1",
    });

    expect(result).toEqual({
      modelCode: model.modelCode,
      scores: [{ id: "c1", score: 0.42 }],
    });
  });
});
